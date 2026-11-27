import crypto from "node:crypto";

const COOKIE = "kopilka_admin";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const GH_API = "https://api.github.com";

function json(statusCode, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}
function cookieValue(event) {
  const raw = event.headers.cookie || event.headers.Cookie || "";
  const match = raw.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : "";
}
function sign(value) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(value).digest("hex");
}
function validSession(event) {
  const token = cookieValue(event);
  if (!token || !process.env.SESSION_SECRET) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  try { return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")); }
  catch { return false; }
}
function sessionCookie(value, maxAge) {
  return `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function requireEnv() {
  for (const key of ["ADMIN_PASSWORD","SESSION_SECRET","GITHUB_TOKEN","GITHUB_OWNER","GITHUB_REPO"]) {
    if (!process.env[key]) throw new Error(`Не настроена переменная Netlify: ${key}`);
  }
}
function safePath(value) {
  if (!value || value.startsWith("/") || value.split("/").includes("..") || !/^[a-zA-Z0-9._/-]+$/.test(value)) throw new Error("Некорректный путь файла");
  return value;
}
async function github(path, options = {}) {
  const response = await fetch(`${GH_API}/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) throw new Error(data.message || `GitHub API: ${response.status}`);
  return { response, data };
}
async function getTextFile(path) {
  const { response, data } = await github(path);
  if (response.status === 404) return { text: "[]\n", sha: null };
  return { text: Buffer.from(data.content || "", "base64").toString("utf8"), sha: data.sha };
}
async function putFile(path, contentBase64, message, sha = undefined) {
  const body = { message, content: contentBase64, branch: process.env.GITHUB_BRANCH || "main" };
  if (sha) body.sha = sha;
  const { response, data } = await github(path, { method: "PUT", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(data.message || `Не удалось записать ${path}`);
  return data;
}
async function deleteFile(path, message) {
  const { response, data } = await github(path);
  if (response.status === 404) return;
  const result = await github(path, { method: "DELETE", body: JSON.stringify({ message, sha: data.sha, branch: process.env.GITHUB_BRANCH || "main" }) });
  if (!result.response.ok) throw new Error(result.data.message || `Не удалось удалить ${path}`);
}
function decodeUpload(upload, folder, allowed) {
  if (!upload) return null;
  if (!allowed.includes(upload.type)) throw new Error("Недопустимый тип загружаемого файла");
  const buffer = Buffer.from(upload.data || "", "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error("Файл пустой или превышает лимит 4 МБ");
  const ext = upload.type === "application/pdf" ? "pdf" : upload.type === "image/png" ? "png" : upload.type === "image/webp" ? "webp" : "jpg";
  const name = `${crypto.randomUUID()}.${ext}`;
  return { path: `public/uploads/${folder}/${name}`, buffer };
}
async function readMaterials() {
  const file = await getTextFile("public/materials.json");
  let list;
  try { list = JSON.parse(file.text); } catch { throw new Error("Файл materials.json содержит некорректный JSON"); }
  if (!Array.isArray(list)) throw new Error("Формат materials.json должен быть массивом");
  return { list, sha: file.sha };
}
async function saveMaterials(list, sha, message) {
  const content = Buffer.from(JSON.stringify(list, null, 2) + "\n").toString("base64");
  await putFile("public/materials.json", content, message, sha);
}
function checkOrigin(event) {
  const origin = event.headers.origin;
  if (!origin) return true;
  const host = event.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function legacyHandler(event) {
  try {
    const method = event.httpMethod;
    const path = (event.path || "").replace(/^.*\/api/, "").replace(/^\/\.netlify\/functions\/api/, "") || "/";
    if (method === "OPTIONS") return new Response(null, { status: 204 });
    if (!checkOrigin(event)) return json(403, { error: "Запрос отклонён: неверный источник." });
    if (path === "/login" && method === "POST") {
      requireEnv();
      const body = JSON.parse(event.body || "{}");
      const supplied = Buffer.from(String(body.password || ""));
      const expected = Buffer.from(process.env.ADMIN_PASSWORD);
      const ok = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
      if (!ok) return json(401, { error: "Неверный пароль." });
      const expires = String(Date.now() + 8 * 60 * 60 * 1000);
      return json(200, { authenticated: true }, { "Set-Cookie": sessionCookie(`${expires}.${sign(expires)}`, 8 * 60 * 60) });
    }
    if (path === "/logout" && method === "POST") return json(200, { authenticated: false }, { "Set-Cookie": sessionCookie("", 0) });
    if (path === "/me" && method === "GET") return json(200, { authenticated: validSession(event) });
    if (path === "/authors" && method === "GET") {
      const file = await getTextFile("public/authors.json");
      let authors;
      try { authors = JSON.parse(file.text); } catch { throw new Error("Файл authors.json содержит некорректный JSON"); }
      return json(200, { items: Array.isArray(authors) ? authors : [] });
    }
    // Публичное чтение каталога: список всегда берётся из того же GitHub-файла, который изменяет админ-панель.
    if (path === "/materials" && method === "GET") {
      requireEnv();
      const { list } = await readMaterials();
      return json(200, { items: list });
    }
    if (!validSession(event)) return json(401, { error: "Необходима авторизация." });
    requireEnv();

    if (path === "/authors" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.name?.trim()) return json(400, { error: "Укажите ФИО автора." });
      const file = await getTextFile("public/authors.json");
      const authors = JSON.parse(file.text);
      const author = {
        id: crypto.randomUUID(),
        name: String(body.name).trim().slice(0,160),
        position: String(body.position || "").trim().slice(0,200),
        qualification: String(body.qualification || "").trim().slice(0,200),
        bio: String(body.bio || "").slice(0,5000),
        photo: String(body.photo || "")
      };
      authors.push(author);
      await putFile("public/authors.json", Buffer.from(JSON.stringify(authors,null,2)+"\\n").toString("base64"), `Добавлен автор: ${author.name}`, file.sha);
      return json(201, { item: author });
    }
    const authorMatch = path.match(/^\\/authors\\/([^/]+)$/);
    if (authorMatch && ["PUT","DELETE"].includes(method)) {
      const id = decodeURIComponent(authorMatch[1]);
      const file = await getTextFile("public/authors.json");
      const authors = JSON.parse(file.text);
      const index = authors.findIndex(x => String(x.id) === id);
      if (index < 0) return json(404, { error: "Автор не найден." });
      if (method === "DELETE") {
        const { list } = await readMaterials();
        if (list.some(x => x.authorId === id)) return json(409, { error: "Нельзя удалить автора, пока к нему привязаны публикации." });
        authors.splice(index,1);
        await putFile("public/authors.json", Buffer.from(JSON.stringify(authors,null,2)+"\\n").toString("base64"), "Удалён автор", file.sha);
        return json(200, { deleted: true });
      }
      const body = JSON.parse(event.body || "{}");
      if (!body.name?.trim()) return json(400, { error: "Укажите ФИО автора." });
      authors[index] = { ...authors[index],
        name: String(body.name).trim().slice(0,160),
        position: String(body.position || "").trim().slice(0,200),
        qualification: String(body.qualification || "").trim().slice(0,200),
        bio: String(body.bio || "").slice(0,5000),
        photo: String(body.photo || authors[index].photo || "")
      };
      await putFile("public/authors.json", Buffer.from(JSON.stringify(authors,null,2)+"\\n").toString("base64"), `Обновлён автор: ${authors[index].name}`, file.sha);
      return json(200, { item: authors[index] });
    }
    if (path === "/materials" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.title?.trim() || !body.authorId) return json(400, { error: "Укажите название и выберите автора." });
      const authorFile = await getTextFile("public/authors.json");
      const authors = JSON.parse(authorFile.text);
      const author = authors.find(x => x.id === body.authorId);
      if (!author) return json(400, { error: "Выбранный автор не найден." });
      const pdf = decodeUpload(body.pdfUpload, "books", ["application/pdf"]);
      const cover = decodeUpload(body.coverUpload, "covers", ["image/jpeg","image/png","image/webp"]);
      if (!cover) return json(400, { error: "Загрузите изображение обложки." });
      if (pdf) await putFile(pdf.path, pdf.buffer.toString("base64"), `Добавлен PDF: ${body.title}`);
      if (cover) await putFile(cover.path, cover.buffer.toString("base64"), `Добавлена обложка: ${body.title}`);
      const { list, sha } = await readMaterials();
      const item = {
        id: crypto.randomUUID(),
        title: String(body.title).trim().slice(0, 200),
        description: String(body.description || "").slice(0, 10000),
        resourceUrl: String(body.resourceUrl || "").trim().slice(0, 2000),
        authorId: author.id,
        author: author.name,
        category: String(body.category || "Методические материалы").trim().slice(0, 100),
        date: String(body.date || new Date().toISOString().slice(0,10)).slice(0,10),
        cover: cover ? `/${cover.path.replace(/^public\//,"")}` : "",
        file: pdf ? `/${pdf.path.replace(/^public\//,"")}` : String(body.file || "")
      };
      list.unshift(item);
      await saveMaterials(list, sha, `Добавлена публикация: ${item.title}`);
      return json(201, { item });
    }

    const match = path.match(/^\/materials\/([^/]+)$/);
    if (match && ["PUT","DELETE"].includes(method)) {
      const id = decodeURIComponent(match[1]);
      const { list, sha } = await readMaterials();
      const index = list.findIndex(x => String(x.id) === id);
      if (index < 0) return json(404, { error: "Материал не найден." });
      const old = list[index];
      if (method === "DELETE") {
        list.splice(index, 1);
        await saveMaterials(list, sha, `Удалена публикация: ${old.title}`);
        // Файлы остаются в репозитории как резерв; при необходимости их можно удалить вручную.
        return json(200, { deleted: true });
      }
      const body = JSON.parse(event.body || "{}");
      if (!body.title?.trim() || !body.authorId) return json(400, { error: "Укажите название и выберите автора." });
      const authorFile = await getTextFile("public/authors.json");
      const authors = JSON.parse(authorFile.text);
      const author = authors.find(x => x.id === body.authorId);
      if (!author) return json(400, { error: "Выбранный автор не найден." });
      const pdf = decodeUpload(body.pdfUpload, "books", ["application/pdf"]);
      const cover = decodeUpload(body.coverUpload, "covers", ["image/jpeg","image/png","image/webp"]);
      if (!cover && !old.cover) return json(400, { error: "Загрузите изображение обложки." });
      if (pdf) await putFile(pdf.path, pdf.buffer.toString("base64"), `Обновлён PDF: ${body.title}`);
      if (cover) await putFile(cover.path, cover.buffer.toString("base64"), `Обновлена обложка: ${body.title}`);
      list[index] = {
        ...old,
        title: String(body.title).trim().slice(0, 200),
        description: String(body.description || "").slice(0, 10000),
        resourceUrl: String(body.resourceUrl || "").trim().slice(0, 2000),
        authorId: author.id,
        author: author.name,
        category: String(body.category || "Методические материалы").trim().slice(0, 100),
        date: String(body.date || old.date || "").slice(0,10),
        cover: cover ? `/${cover.path.replace(/^public\//,"")}` : old.cover,
        file: pdf ? `/${pdf.path.replace(/^public\//,"")}` : old.file
      };
      await saveMaterials(list, sha, `Обновлена публикация: ${list[index].title}`);
      return json(200, { item: list[index] });
    }
    return json(404, { error: "Маршрут не найден." });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || "Внутренняя ошибка сервера." });
  }
}
export default async (request) => {
  const headers = Object.fromEntries(request.headers.entries());

  const event = {
    httpMethod: request.method,
    path: new URL(request.url).pathname,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? null
      : await request.text()
  };

  return await legacyHandler(event);
};
