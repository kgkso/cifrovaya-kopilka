import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const COOKIE = "kopilka_admin";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const GH_API = "https://api.github.com";
const STORE = () => getStore("kopilka-production");

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
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
function requireAuthEnv() {
  for (const key of ["ADMIN_PASSWORD", "SESSION_SECRET"]) {
    if (!process.env[key]) throw new Error(`Не настроена переменная Netlify: ${key}`);
  }
}
function requireGithubEnv() {
  for (const key of ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"]) {
    if (!process.env[key]) throw new Error(`Для первичного переноса данных не настроена переменная Netlify: ${key}`);
  }
}
function safePath(value) {
  if (!value || value.startsWith("/") || value.split("/").includes("..") || !/^[a-zA-Z0-9._/-]+$/.test(value)) {
    throw new Error("Некорректный путь файла");
  }
  return value;
}
async function github(path) {
  requireGithubEnv();
  const response = await fetch(`${GH_API}/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`, {
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) throw new Error(data.message || `GitHub API: ${response.status}`);
  return { response, data };
}
async function getLegacyText(path) {
  const { response, data } = await github(path);
  if (response.status === 404) return "[]\n";
  if (data.encoding !== "base64" || !data.content) throw new Error(`Не удалось прочитать старый файл ${path}`);
  return Buffer.from(data.content, "base64").toString("utf8");
}

// Первый запрос переносит существующие JSON-файлы из GitHub в постоянное хранилище Netlify.
// После переноса все изменения выполняются только в Blobs и не создают Git-коммиты.
async function readCollection(name, legacyPath) {
  const store = STORE();
  const current = await store.get(name, { type: "json", consistency: "strong" });
  if (current !== null) {
    if (!Array.isArray(current)) throw new Error(`Хранилище ${name} содержит некорректные данные`);
    return current;
  }
  let legacy;
  try { legacy = JSON.parse(await getLegacyText(legacyPath)); }
  catch (error) { throw new Error(`Не удалось перенести ${legacyPath}: ${error.message}`); }
  if (!Array.isArray(legacy)) throw new Error(`Файл ${legacyPath} должен содержать массив`);
  try {
    await store.setJSON(name, legacy, { onlyIfNew: true });
    return legacy;
  } catch {
    const winner = await store.get(name, { type: "json", consistency: "strong" });
    if (Array.isArray(winner)) return winner;
    throw new Error("Не удалось инициализировать хранилище публикаций.");
  }
}
async function saveCollection(name, items) {
  await STORE().setJSON(name, items);
}
function checkOrigin(event) {
  const origin = event.headers.origin;
  if (!origin) return true;
  const host = event.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}
function decodeUpload(upload, folder, allowed) {
  if (!upload) return null;
  if (!allowed.includes(upload.type)) throw new Error("Недопустимый тип загружаемого файла");
  const buffer = Buffer.from(upload.data || "", "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error("Файл пустой или превышает лимит 4 МБ");
  const ext = upload.type === "application/pdf" ? "pdf" : upload.type === "image/png" ? "png" : upload.type === "image/webp" ? "webp" : "jpg";
  return { key: `files/${folder}/${crypto.randomUUID()}.${ext}`, buffer, type: upload.type, name: String(upload.name || "").slice(0, 180) };
}
async function saveUpload(upload) {
  if (!upload) return null;
  await STORE().set(upload.key, upload.buffer, { metadata: { contentType: upload.type, fileName: upload.name } });
  return upload;
}
async function serveBlob(key, fallbackType) {
  const result = await STORE().getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
  if (!result || !result.data) return null;
  const contentType = result.metadata?.contentType || fallbackType;
  return new Response(result.data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(result.data.byteLength),
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": contentType === "application/pdf" ? "inline" : "inline"
    }
  });
}
async function serveLegacyPdf(relative) {
  const { response, data } = await github(`public/${relative}`);
  if (response.status === 404) return json(404, { error: "PDF-файл отсутствует в старом хранилище." });
  let bytes;
  if (data.content && data.encoding === "base64") bytes = Buffer.from(data.content.replace(/\\n/g, ""), "base64");
  else if (data.download_url) {
    const raw = await fetch(data.download_url, { headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.raw" } });
    if (!raw.ok) return json(502, { error: "Не удалось получить PDF из GitHub." });
    bytes = Buffer.from(await raw.arrayBuffer());
  } else return json(502, { error: "GitHub не предоставил содержимое PDF." });
  return new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length), "Cache-Control": "public, max-age=300", "Content-Disposition": "inline" } });
}

async function handler(event) {
  try {
    const method = event.httpMethod;
    const path = (event.path || "").replace(/^.*\/api/, "").replace(/^\/\.netlify\/functions\/api/, "") || "/";
    if (method === "OPTIONS") return new Response(null, { status: 204 });
    if (!checkOrigin(event)) return json(403, { error: "Запрос отклонён: неверный источник." });

    if (path === "/login" && method === "POST") {
      requireAuthEnv();
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

    if (path.startsWith("/media/") && method === "GET") {
      const relative = safePath(path.slice(7));
      if (!relative.startsWith("covers/") || !/\.(jpg|png|webp)$/i.test(relative)) return json(404, { error: "Изображение не найдено." });
      return await serveBlob(`files/${relative}`, "image/jpeg") || json(404, { error: "Изображение не найдено." });
    }
    if (path.startsWith("/pdf/") && method === "GET") {
      const relative = safePath(path.slice(5));
      if (relative.startsWith("blobs/books/") && relative.endsWith(".pdf")) {
        return await serveBlob(`files/books/${relative.slice("blobs/books/".length)}`, "application/pdf") || json(404, { error: "PDF не найден." });
      }
      if (relative.startsWith("uploads/books/") && relative.endsWith(".pdf")) return await serveLegacyPdf(relative);
      return json(404, { error: "PDF не найден." });
    }

    if (path === "/authors" && method === "GET") {
      const authors = await readCollection("authors", "public/authors.json");
      return json(200, { items: authors });
    }
    if (path === "/materials" && method === "GET") {
      const list = await readCollection("materials", "public/materials.json");
      return json(200, { items: list });
    }

    if (!validSession(event)) return json(401, { error: "Необходима авторизация." });
    requireAuthEnv();

    if (path === "/authors" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.name?.trim()) return json(400, { error: "Укажите ФИО автора." });
      const authors = await readCollection("authors", "public/authors.json");
      const author = {
        id: crypto.randomUUID(),
        name: String(body.name).trim().slice(0, 160),
        position: String(body.position || "").trim().slice(0, 200),
        qualification: String(body.qualification || "").trim().slice(0, 200),
        bio: String(body.bio || "").slice(0, 5000),
        photo: String(body.photo || "").trim().slice(0, 2000)
      };
      authors.push(author);
      await saveCollection("authors", authors);
      return json(201, { item: author });
    }
    const authorMatch = path.match(/^\/authors\/([^/]+)$/);
    if (authorMatch && ["PUT", "DELETE"].includes(method)) {
      const id = decodeURIComponent(authorMatch[1]);
      const authors = await readCollection("authors", "public/authors.json");
      const index = authors.findIndex(x => String(x.id) === id);
      if (index < 0) return json(404, { error: "Автор не найден." });
      if (method === "DELETE") {
        const list = await readCollection("materials", "public/materials.json");
        if (list.some(x => x.authorId === id || (!x.authorId && x.author === authors[index].name))) {
          return json(409, { error: "Нельзя удалить автора, пока к нему привязаны публикации." });
        }
        authors.splice(index, 1);
        await saveCollection("authors", authors);
        return json(200, { deleted: true });
      }
      const body = JSON.parse(event.body || "{}");
      if (!body.name?.trim()) return json(400, { error: "Укажите ФИО автора." });
      authors[index] = {
        ...authors[index],
        name: String(body.name).trim().slice(0, 160),
        position: String(body.position || "").trim().slice(0, 200),
        qualification: String(body.qualification || "").trim().slice(0, 200),
        bio: String(body.bio || "").slice(0, 5000),
        photo: String(body.photo || authors[index].photo || "").slice(0, 2000)
      };
      await saveCollection("authors", authors);
      return json(200, { item: authors[index] });
    }

    if (path === "/materials" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.title?.trim() || !body.authorId) return json(400, { error: "Укажите название и выберите автора." });
      const authors = await readCollection("authors", "public/authors.json");
      const author = authors.find(x => x.id === body.authorId);
      if (!author) return json(400, { error: "Выбранный автор не найден." });
      const pdf = decodeUpload(body.pdfUpload, "books", ["application/pdf"]);
      const cover = decodeUpload(body.coverUpload, "covers", ["image/jpeg", "image/png", "image/webp"]);
      if (!cover) return json(400, { error: "Загрузите изображение обложки." });
      await Promise.all([saveUpload(pdf), saveUpload(cover)]);
      const list = await readCollection("materials", "public/materials.json");
      const item = {
        id: crypto.randomUUID(),
        title: String(body.title).trim().slice(0, 200),
        description: String(body.description || "").slice(0, 10000),
        resourceUrl: String(body.resourceUrl || "").trim().slice(0, 2000),
        authorId: author.id,
        author: author.name,
        category: String(body.category || "Методические материалы").trim().slice(0, 100),
        date: String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
        cover: `/.netlify/functions/api/media/${cover.key.slice("files/".length)}`,
        file: pdf ? `/blobs/${pdf.key.slice("files/".length)}` : String(body.file || "")
      };
      list.unshift(item);
      await saveCollection("materials", list);
      return json(201, { item });
    }

    const match = path.match(/^\/materials\/([^/]+)$/);
    if (match && ["PUT", "DELETE"].includes(method)) {
      const id = decodeURIComponent(match[1]);
      const list = await readCollection("materials", "public/materials.json");
      const index = list.findIndex(x => String(x.id) === id);
      if (index < 0) return json(404, { error: "Материал не найден." });
      const old = list[index];
      if (method === "DELETE") {
        list.splice(index, 1);
        await saveCollection("materials", list);
        return json(200, { deleted: true });
      }
      const body = JSON.parse(event.body || "{}");
      if (!body.title?.trim() || !body.authorId) return json(400, { error: "Укажите название и выберите автора." });
      const authors = await readCollection("authors", "public/authors.json");
      const author = authors.find(x => x.id === body.authorId);
      if (!author) return json(400, { error: "Выбранный автор не найден." });
      const pdf = decodeUpload(body.pdfUpload, "books", ["application/pdf"]);
      const cover = decodeUpload(body.coverUpload, "covers", ["image/jpeg", "image/png", "image/webp"]);
      if (!cover && !old.cover) return json(400, { error: "Загрузите изображение обложки." });
      await Promise.all([saveUpload(pdf), saveUpload(cover)]);
      list[index] = {
        ...old,
        title: String(body.title).trim().slice(0, 200),
        description: String(body.description || "").slice(0, 10000),
        resourceUrl: String(body.resourceUrl || "").trim().slice(0, 2000),
        authorId: author.id,
        author: author.name,
        category: String(body.category || "Методические материалы").trim().slice(0, 100),
        date: String(body.date || old.date || "").slice(0, 10),
        cover: cover ? `/.netlify/functions/api/media/${cover.key.slice("files/".length)}` : old.cover,
        file: pdf ? `/blobs/${pdf.key.slice("files/".length)}` : old.file
      };
      await saveCollection("materials", list);
      return json(200, { item: list[index] });
    }
    return json(404, { error: "Маршрут не найден." });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || "Внутренняя ошибка сервера." });
  }
}

export default async request => {
  const headers = Object.fromEntries(request.headers.entries());
  const event = {
    httpMethod: request.method,
    path: new URL(request.url).pathname,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? null : await request.text()
  };
  return await handler(event);
};
