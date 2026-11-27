import React, { useEffect, useMemo, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const API = "/.netlify/functions/api";
const FALLBACK_COVER = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#123b5b"/><stop offset="1" stop-color="#2c8291"/></linearGradient></defs>
<rect width="600" height="800" fill="url(#g)"/><circle cx="500" cy="120" r="170" fill="#ffffff" opacity=".08"/><circle cx="60" cy="700" r="220" fill="#ffffff" opacity=".06"/>
<path d="M90 170h420M90 190h260" stroke="#d8e9e9" stroke-width="4" opacity=".55"/>
<text x="70" y="340" fill="white" font-family="Arial" font-size="42" font-weight="bold">ЦИФРОВАЯ</text><text x="70" y="395" fill="white" font-family="Arial" font-size="42" font-weight="bold">КОПИЛКА</text>
<text x="70" y="470" fill="#d8e9e9" font-family="Arial" font-size="22">ПЕДАГОГИЧЕСКОГО ОПЫТА</text><path d="M70 540h300" stroke="#d8e9e9" stroke-width="3"/>
</svg>`);

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Не удалось выполнить запрос");
  return data;
}

function Header({ page, navigate }) {
  return <header className="site-header">
    <button className="brand" onClick={() => navigate("home")} aria-label="На главную">
      <span className="brand-mark">К</span>
      <span><b>ЦИФРОВАЯ КОПИЛКА</b><small>ПЕДАГОГИЧЕСКОГО ОПЫТА</small></span>
    </button>
    <nav>
      <button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}>Главная</button>
      <button className={page === "catalog" ? "active" : ""} onClick={() => navigate("catalog")}>Каталог</button>
      <button className={page === "authors" ? "active" : ""} onClick={() => navigate("authors")}>Авторы</button>
      <button className={page === "about" ? "active" : ""} onClick={() => navigate("about")}>О копилке</button>
    </nav>
    <button className="header-admin" onClick={() => navigate("admin")}> <span>↗</span> Администрирование</button>
  </header>;
}

function Footer({ navigate }) {
  return <footer className="footer">
    <div><b>ЦИФРОВАЯ КОПИЛКА</b><p>Учреждение образования «Кобринский государственный колледж сферы обслуживания»</p></div>
    <button onClick={() => navigate("about")}>О проекте</button>
    <span>© {new Date().getFullYear()} · Педагогический опыт колледжа</span>
    <small className="site-version">Бета · v0.1.0</small>
  </footer>;
}

function Cover({ src, title }) {
  return <div className="cover-wrap"><img src={src || FALLBACK_COVER} alt={`Обложка: ${title}`} onError={e => { e.currentTarget.src = FALLBACK_COVER; }} /></div>;
}

function authorName(item, authors=[]) { return authors.find(a => a.id === item.authorId)?.name || item.author || "Не указан"; }

function MaterialCard({ item, navigate, authors=[] }) {
  return <article className="material-card">
    <button className="cover-button" onClick={() => navigate("material", item.id)}><Cover src={item.cover} title={item.title} /></button>
    <div className="material-info">
      <span className="category">{item.category || "Методические материалы"}</span>
      <h3><button className="title-link" onClick={() => navigate("material", item.id)}>{item.title}</button></h3>
      <p>{item.description || "Описание материала пока не добавлено."}</p>
      <button className="author-link" onClick={() => navigate("author", item.authorId || item.author)}>Автор: {authorName(item, authors)}</button>
      <button className="read-link" onClick={() => navigate("material", item.id)}>Открыть материал <span>→</span></button>
    </div>
  </article>;
}

function Home({ materials, authors, navigate }) {
  const latest = [...materials].sort((a,b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);
  return <>
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow"><i /> ЭЛЕКТРОННАЯ БИБЛИОТЕКА КОЛЛЕДЖА</span>
        <h1>Опыт, которым<br/><em>хочется делиться.</em></h1>
        <p>Методические разработки, педагогические находки и инновационные идеи преподавателей и мастеров производственного обучения.</p>
        <div className="hero-actions"><button className="primary" onClick={() => navigate("catalog")}>Перейти в каталог <span>→</span></button><button className="text-button" onClick={() => navigate("about")}>О проекте</button></div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
        <div className="book-visual"><div className="book-spine"></div><div className="book-front"><span>ПЕДАГОГИЧЕСКИЙ<br/>ОПЫТ</span><b>К</b><small>КОБРИНСКИЙ КОЛЛЕДЖ</small></div></div>
        <div className="floating-note note-one">✦ Методические идеи</div><div className="floating-note note-two">Знания · Практика · Развитие</div>
      </div>
      <div className="hero-bottom"><span>01 / ЕДИНОЕ ПРОСТРАНСТВО ЗНАНИЙ</span><span>ЛИСТАЙТЕ И ОТКРЫВАЙТЕ НОВОЕ ↓</span></div>
    </section>
    <section className="stats">
      <div><b>{materials.length.toString().padStart(2,"0")}</b><span>ПУБЛИКАЦИЙ В КОПИЛКЕ</span></div>
      <div><b>{new Set(materials.map(x => x.author).filter(Boolean)).size.toString().padStart(2,"0")}</b><span>АВТОРОВ</span></div>
      <div><b>{new Set(materials.map(x => x.category).filter(Boolean)).size.toString().padStart(2,"0")}</b><span>НАПРАВЛЕНИЙ</span></div>
      <div className="stats-note">Педагогический опыт становится ценнее, когда им делятся.</div>
    </section>
    <section className="section">
      <div className="section-heading"><div><span className="eyebrow">БИБЛИОТЕКА ОПЫТА</span><h2>Новые публикации</h2></div><button className="outline" onClick={() => navigate("catalog")}>Весь каталог <span>→</span></button></div>
      {latest.length ? <div className="material-grid">{latest.map(item => <MaterialCard key={item.id} item={item} authors={authors} navigate={navigate}/>)}</div> : <EmptyState text="Публикации появятся здесь после добавления первых материалов в административной панели."/>}
    </section>
    <section className="callout"><div><span className="eyebrow">ЕДИНАЯ ПЕДАГОГИЧЕСКАЯ СРЕДА</span><h2>Каждая разработка —<br/>часть общего опыта.</h2></div><button className="light-button" onClick={() => navigate("authors")}>Познакомиться с авторами →</button></section>
  </>;
}

function EmptyState({ text }) { return <div className="empty-state"><div className="empty-icon">⌕</div><h3>Пока здесь нет материалов</h3><p>{text}</p></div>; }

function Catalog({ materials, authors, navigate }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все категории");
  const categories = ["Все категории", ...new Set(materials.map(x => x.category).filter(Boolean))];
  const filtered = materials.filter(x => {
    const hay = `${x.title} ${x.author} ${x.description} ${x.category}`.toLowerCase();
    return hay.includes(query.toLowerCase()) && (category === "Все категории" || x.category === category);
  });
  return <main className="page-shell">
    <PageIntro eyebrow="ЭЛЕКТРОННЫЙ ФОНД" title="Каталог материалов" text="Методические пособия, разработки занятий, презентации и другие материалы педагогического опыта."/>
    <div className="catalog-tools"><label className="search-box"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию, автору или описанию"/></label><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select><span className="result-count">{filtered.length} материалов</span></div>
    {filtered.length ? <div className="material-grid">{filtered.map(item => <MaterialCard key={item.id} item={item} authors={authors} navigate={navigate}/>)}</div> : <EmptyState text="Попробуйте изменить поисковый запрос или выбрать другую категорию."/>}
  </main>;
}

function Authors({ materials, authors, navigate }) {
  return <main className="page-shell"><PageIntro eyebrow="ПЕДАГОГИЧЕСКОЕ СООБЩЕСТВО" title="Наши авторы" text="Преподаватели и мастера производственного обучения, которые делятся своими наработками и профессиональным опытом."/>
    {authors.length ? <div className="authors-grid">{authors.map(author => <button className="author-card" key={author.id} onClick={() => navigate("author", author.id)}>{author.photo ? <img className="author-photo" src={author.photo} alt={author.name}/> : <span className="author-avatar">{author.name.split(" ").map(x => x[0]).slice(0,2).join("").toUpperCase()}</span>}<span className="author-card-text"><b>{author.name}</b><small>{author.position || "Педагогический работник"} · {materials.filter(x => x.authorId === author.id || (!x.authorId && x.author === author.name)).length} публикаций</small></span><span className="arrow">↗</span></button>)}</div> : <EmptyState text="Авторы появятся после добавления в административной панели."/>}
  </main>;
}

function AuthorPage({ authorId, authors, materials, navigate }) {
  const author = authors.find(x => x.id === authorId) || authors.find(x => x.name === authorId);
  const list = materials.filter(x => x.authorId === author?.id || (!x.authorId && x.author === author?.name));
  if (!author) return <main className="page-shell"><EmptyState text="Профиль автора не найден."/></main>;
  return <main className="page-shell"><button className="back-link" onClick={() => navigate("authors")}>← Все авторы</button><div className="author-profile">{author.photo ? <img src={author.photo} alt={author.name}/> : <span className="author-avatar large">{author.name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase()}</span>}<div><span className="eyebrow">АВТОР ПУБЛИКАЦИЙ</span><h1>{author.name}</h1>{author.position && <p><b>{author.position}</b></p>}{author.qualification && <p>{author.qualification}</p>}{author.bio && <div className="rich-content" dangerouslySetInnerHTML={{__html:safeRichHtml(author.bio)}}/>}</div></div><div className="section-heading"><div><span className="eyebrow">ПУБЛИКАЦИИ АВТОРА</span><h2>Материалы ({list.length})</h2></div></div>{list.length ? <div className="material-grid">{list.map(item => <MaterialCard key={item.id} item={item} authors={authors} navigate={navigate}/>)}</div> : <EmptyState text="У этого автора пока нет опубликованных материалов."/>}</main>;
}

function PageIntro({ eyebrow, title, text }) { return <div className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>; }

function About() {
  return <main className="page-shell about-page"><PageIntro eyebrow="О ПРОЕКТЕ" title="Знания, опыт и идеи — в одном пространстве." text="Цифровая копилка педагогического опыта объединяет методические материалы и профессиональные наработки педагогических работников колледжа."/>
    <div className="about-layout"><div className="about-main"><h2>Что такое цифровая копилка?</h2><p>«Цифровая копилка педагогического опыта» — это цифровая платформа, созданная для систематизации, хранения и обмена методическими материалами, педагогическими наработками и инновационными идеями преподавателей и мастеров производственного обучения учреждения образования «Кобринский государственный колледж сферы обслуживания».</p><p>Копилка создана для популяризации опыта деятельности преподавателей и мастеров производственного обучения колледжа и является одной из форм его распространения. Размещение материалов на сайте обеспечивает свободный доступ к ресурсам широкого круга педагогической общественности и способствует сетевому взаимодействию с коллегами.</p><h2>Цель проекта</h2><p>Создание единого информационного пространства для накопления, сохранения, представления и распространения эффективного педагогического опыта.</p></div><aside className="about-aside"><span className="eyebrow">НАШИ ЗАДАЧИ</span>{["Систематизация методических материалов","Популяризация педагогического опыта","Обмен профессиональными идеями","Поддержка инновационной деятельности","Открытый доступ к образовательным ресурсам"].map((x,i)=><div className="task" key={x}><b>0{i+1}</b><span>{x}</span></div>)}</aside></div>
    <div className="about-quote">«Педагогический опыт приобретает особую ценность, когда становится доступным для профессионального сообщества.»</div>
    <div className="college-sign"><span className="brand-mark">К</span><div><b>Кобринский государственный колледж сферы обслуживания</b><small>Учреждение образования · Республика Беларусь</small></div></div>
  </main>;
}

function MaterialPage({ item, authors, navigate }) {
  if (!item) return <main className="page-shell"><EmptyState text="Материал не найден."/></main>;
  return <main className="page-shell"><button className="back-link" onClick={() => navigate("catalog")}>← Вернуться в каталог</button><div className="material-detail"><div className="detail-cover"><Cover src={item.cover} title={item.title}/></div><div className="detail-copy"><span className="category">{item.category || "Методические материалы"}</span><h1>{item.title}</h1><div className="detail-description rich-content" dangerouslySetInnerHTML={{__html:safeRichHtml(item.description)}}/><div className="detail-meta"><span>АВТОР</span><button className="author-link" onClick={() => navigate("author", item.authorId || item.author)}>{authorName(item, authors)} ↗</button></div><div className="detail-meta"><span>ДАТА ПУБЛИКАЦИИ</span><b>{item.date || "Не указана"}</b></div><div className="detail-actions">{item.file && <><button className="primary" onClick={() => navigate("reader", item.id)}>Читать книгу <span>→</span></button><a className="outline anchor-button" href={item.file} download>Скачать PDF ↓</a></>}{item.resourceUrl && <a className="outline anchor-button" href={item.resourceUrl} target="_blank" rel="noopener noreferrer">Открыть электронный ресурс ↗</a>}{!item.file && !item.resourceUrl && <span className="muted">Для этой публикации доступно описание без прикреплённого файла.</span>}</div></div></div></main>;
}

function PdfPage({ pdf, number, width }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let task;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(number);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min((width - 24) / base.width, 1.6) });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; if (task) task.cancel?.(); };
  }, [pdf, number, width]);
  return <div className="pdf-page"><canvas ref={canvasRef}/><span className="page-number">{number}</span></div>;
}

function Reader({ item, navigate }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 440, height: 620 });
  const bookRef = useRef(null);
  useEffect(() => {
    if (!item?.file) { setError("Для этой публикации не указан PDF-файл."); return; }
    let active = true;
    pdfjsLib.getDocument(item.file).promise.then(doc => { if (active) setPdf(doc); }).catch(() => setError("Не удалось открыть PDF. Проверьте доступность файла."));
    return () => { active = false; };
  }, [item]);
  useEffect(() => {
    const update = () => {
      const w = Math.min(460, Math.max(280, window.innerWidth - 48));
      setDimensions({ width: w, height: Math.round(w * 1.38) });
    };
    update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update);
  }, []);
  if (!item) return <main className="page-shell"><EmptyState text="Материал не найден."/></main>;
  return <main className="reader-shell"><div className="reader-top"><button className="back-link" onClick={() => navigate("material", item.id)}>← К описанию</button><div><b>{item.title}</b><span>{item.author}</span></div><a href={item.file} download className="reader-download">Скачать PDF ↓</a></div>
    <div className="reader-stage"><div className="reader-heading"><span className="eyebrow">ЭЛЕКТРОННОЕ ИЗДАНИЕ</span><h1>{item.title}</h1><p>Листайте страницы, используя стрелки или перетаскивание уголка книги</p></div>
      {error ? <div className="reader-error">{error}</div> : !pdf ? <div className="loading">Загружаем страницы книги…</div> : <><div className="book-frame"><HTMLFlipBook ref={bookRef} width={dimensions.width} height={dimensions.height} size="stretch" minWidth={280} maxWidth={460} minHeight={380} maxHeight={680} maxShadowOpacity={0.45} showCover={true} mobileScrollSupport={true} onFlip={e => setPage(e.data)} className="flip-book">{Array.from({length: pdf.numPages}, (_,i)=><div className="page-holder" key={i}><PdfPage pdf={pdf} number={i+1} width={dimensions.width}/></div>)}</HTMLFlipBook></div><div className="reader-controls"><button onClick={() => bookRef.current?.pageFlip().flipPrev()} disabled={page <= 0}>← Назад</button><span>Страница <b>{Math.min(page+1,pdf.numPages)}</b> из {pdf.numPages}</span><button onClick={() => bookRef.current?.pageFlip().flipNext()} disabled={page >= pdf.numPages-1}>Вперёд →</button></div></>}
    </div>
  </main>;
}

function safeRichHtml(value="") {
  const input=String(value||"");
  if(typeof window==="undefined")return input.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
  const doc=new DOMParser().parseFromString(input,"text/html");
  const allowed=new Set(["P","BR","STRONG","B","EM","I","U","UL","OL","LI","A","H2","H3","BLOCKQUOTE"]);
  const walk=node=>{[...node.childNodes].forEach(child=>{if(child.nodeType===1){if(!allowed.has(child.tagName)){child.replaceWith(...child.childNodes);return;}[...child.attributes].forEach(attr=>{if(child.tagName!=="A"||attr.name!=="href"||!/^https?:\/\//i.test(attr.value)){child.removeAttribute(attr.name);}});if(child.tagName==="A"){child.setAttribute("target","_blank");child.setAttribute("rel","noopener noreferrer");}walk(child);}else if(child.nodeType!==3)child.remove();});};
  walk(doc.body);return doc.body.innerHTML;
}

function RichTextEditor({ value, onChange, label="Описание" }) {
  const ref=useRef(null);
  useEffect(()=>{if(ref.current && ref.current.innerHTML!==safeRichHtml(value))ref.current.innerHTML=safeRichHtml(value);},[value]);
  const command=(cmd,arg=null)=>{ref.current?.focus();document.execCommand(cmd,false,arg);onChange(ref.current?.innerHTML||"");};
  const addLink=()=>{const url=window.prompt("Введите адрес ссылки (https://...)");if(!url)return;const safe=/^https?:\/\//i.test(url.trim())?url.trim():"https://"+url.trim();command("createLink",safe);};
  return <label className="rich-editor-label">{label}<div className="rich-editor"><div className="rich-toolbar"><button type="button" onClick={()=>command("bold")}><b>B</b></button><button type="button" onClick={()=>command("italic")}><i>I</i></button><button type="button" onClick={()=>command("underline")}><u>U</u></button><button type="button" onClick={()=>command("insertUnorderedList")}>• Список</button><button type="button" onClick={()=>command("insertOrderedList")}>1. Список</button><button type="button" onClick={addLink}>↗ Ссылка</button></div><div ref={ref} className="rich-editor-area" contentEditable suppressContentEditableWarning onInput={e=>onChange(e.currentTarget.innerHTML)} data-placeholder="Введите описание материала..."/></div></label>;
}

function Admin({ materials, authors, reload, reloadAuthors, navigate }) {
  const [authenticated,setAuthenticated]=useState(null),[password,setPassword]=useState(""),[loginError,setLoginError]=useState("");
  const [editing,setEditing]=useState(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState(""),[tab,setTab]=useState("materials");
  const blank={title:"",description:"",authorId:authors[0]?.id||"",category:"Методические пособия",date:new Date().toISOString().slice(0,10),cover:"",file:"",resourceUrl:""};
  const blankAuthor={name:"",position:"",qualification:"",bio:"",photo:""};
  const [form,setForm]=useState(blank),[authorForm,setAuthorForm]=useState(blankAuthor),[editingAuthor,setEditingAuthor]=useState(null);
  useEffect(()=>{request("/me").then(x=>setAuthenticated(x.authenticated)).catch(()=>setAuthenticated(false));},[]);
  useEffect(()=>{if(!form.authorId&&authors.length)setForm(x=>({...x,authorId:authors[0].id}));},[authors]);
  const login=async e=>{e.preventDefault();setLoginError("");try{await request("/login",{method:"POST",body:JSON.stringify({password})});setAuthenticated(true);setPassword("");}catch(err){setLoginError(err.message);}};
  const logout=async()=>{await request("/logout",{method:"POST",body:"{}"});setAuthenticated(false);setEditing(null);};
  const startEdit=item=>{setEditing(item.id);setTab("materials");setForm({...blank,...item,authorId:item.authorId||authors.find(a=>a.name===item.author)?.id||""});setNotice("");window.scrollTo({top:0,behavior:"smooth"});};
  const startNew=()=>{setEditing("new");setForm({...blank,authorId:authors[0]?.id||""});setNotice("");};
  const fileToData=file=>new Promise((resolve,reject)=>{if(!file)return resolve(null);const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,data:String(reader.result).split(",")[1]});reader.onerror=reject;reader.readAsDataURL(file);});
  const save=async e=>{e.preventDefault();const el=e.currentTarget;setSaving(true);setNotice("");try{const coverUpload=await fileToData(el.elements.namedItem("coverFile")?.files?.[0]||null);const pdfUpload=await fileToData(el.elements.namedItem("pdfFile")?.files?.[0]||null);const payload={...form,coverUpload,pdfUpload};if(!editing||editing==="new")await request("/materials",{method:"POST",body:JSON.stringify(payload)});else await request(`/materials/${encodeURIComponent(editing)}`,{method:"PUT",body:JSON.stringify(payload)});await reload();setEditing(null);setForm({...blank,authorId:authors[0]?.id||""});setNotice("Материал успешно сохранён и опубликован.");}catch(err){setNotice("Ошибка: "+err.message);}finally{setSaving(false);}};
  const remove=async item=>{if(!window.confirm(`Удалить публикацию «${item.title}»?`))return;try{await request(`/materials/${encodeURIComponent(item.id)}`,{method:"DELETE",body:"{}"});await reload();setNotice("Материал удалён.");}catch(err){setNotice("Ошибка: "+err.message);}};
  const saveAuthor=async e=>{e.preventDefault();setSaving(true);setNotice("");try{const path=editingAuthor?"/authors/"+encodeURIComponent(editingAuthor):"/authors";await request(path,{method:editingAuthor?"PUT":"POST",body:JSON.stringify(authorForm)});await reloadAuthors();setAuthorForm(blankAuthor);setEditingAuthor(null);setNotice("Профиль автора сохранён.");}catch(err){setNotice("Ошибка: "+err.message);}finally{setSaving(false);}};
  const deleteAuthor=async author=>{if(!window.confirm(`Удалить профиль «${author.name}»?`))return;try{await request("/authors/"+encodeURIComponent(author.id),{method:"DELETE",body:"{}"});await reloadAuthors();setNotice("Автор удалён.");}catch(err){setNotice("Ошибка: "+err.message);}};
  if(authenticated===null)return <main className="admin-shell"><div className="loading">Проверка доступа…</div></main>;
  if(!authenticated)return <main className="admin-shell"><form className="login-card" onSubmit={login}><div className="login-symbol">К</div><span className="eyebrow">ЗАКРЫТЫЙ РАЗДЕЛ</span><h1>Вход в админ-панель</h1><p>Управление публикациями цифровой копилки.</p><label>Пароль администратора<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Введите пароль"/></label>{loginError&&<div className="form-error">{loginError}</div>}<button className="primary full" type="submit">Войти в систему →</button><button className="back-link centered" type="button" onClick={()=>navigate("home")}>← Вернуться на сайт</button></form></main>;
  return <main className="admin-shell"><div className="admin-heading"><div><span className="eyebrow">УПРАВЛЕНИЕ САЙТОМ</span><h1>Административная панель</h1><p>Управляйте авторами и публикациями электронной библиотеки.</p></div><button className="outline" onClick={logout}>Выйти ↗</button></div>
    {notice&&<div className={notice.startsWith("Ошибка")?"notice error":"notice"}>{notice}</div>}
    <div className="admin-tabs"><button className={tab==="materials"?"selected":""} onClick={()=>{setTab("materials");setEditing(null);}}>Материалы</button><button className={tab==="authors"?"selected":""} onClick={()=>{setTab("authors");setEditing(null);}}>Авторы</button></div>
    {tab==="materials"?<div className="admin-columns"><section className="admin-form-card"><div className="admin-card-heading"><h2>{editing==="new"?"Новая публикация":editing?"Редактирование публикации":"Добавить материал"}</h2>{editing&&<button className="back-link" onClick={()=>{setEditing(null);setForm({...blank,authorId:authors[0]?.id||""});}}>Отмена</button>}</div>
      <form onSubmit={save} className="material-form"><label>Название материала *<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Например, Методические рекомендации"/></label><label>Автор *<select required value={form.authorId} onChange={e=>setForm({...form,authorId:e.target.value})}><option value="">Выберите автора</option>{authors.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{!authors.length&&<small>Сначала добавьте автора во вкладке «Авторы».</small>}</label><RichTextEditor value={form.description} onChange={description=>setForm(x=>({...x,description}))}/><label>Ссылка на электронный ресурс<input type="url" value={form.resourceUrl} onChange={e=>setForm({...form,resourceUrl:e.target.value})} placeholder="https://..."/></label><div className="form-row"><label>Категория<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Дата публикации<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div><label>Обложка *<input type="file" name="coverFile" accept="image/png,image/jpeg,image/webp" required={!form.cover}/></label><label>PDF-файл (необязательно)<input type="file" name="pdfFile" accept="application/pdf"/></label><button className="primary full" disabled={saving||!authors.length}>{saving?"Сохранение…":editing==="new"?"Опубликовать материал →":"Сохранить изменения →"}</button></form>
    </section><section className="admin-list-card"><div className="admin-card-heading"><h2>Публикации <span className="count-pill">{materials.length}</span></h2><button className="primary small" onClick={startNew}>+ Добавить</button></div><div className="admin-material-list">{materials.map(item=><div className="admin-material" key={item.id}><img src={item.cover||FALLBACK_COVER}/><div><b>{item.title}</b><span>{authorName(item,authors)}</span><small>{item.category}</small></div><div className="admin-row-actions"><button onClick={()=>startEdit(item)}>✎</button><button className="delete" onClick={()=>remove(item)}>×</button></div></div>)}</div></section></div>
    :<div className="admin-columns"><section className="admin-form-card"><div className="admin-card-heading"><h2>{editingAuthor?"Редактирование автора":"Добавить автора"}</h2>{editingAuthor&&<button className="back-link" onClick={()=>{setEditingAuthor(null);setAuthorForm(blankAuthor);}}>Отмена</button>}</div><form className="material-form" onSubmit={saveAuthor}><label>Фамилия, имя, отчество *<input required value={authorForm.name} onChange={e=>setAuthorForm({...authorForm,name:e.target.value})}/></label><label>Должность<input value={authorForm.position} onChange={e=>setAuthorForm({...authorForm,position:e.target.value})} placeholder="Преподаватель учебных предметов..."/></label><label>Квалификационная категория<input value={authorForm.qualification} onChange={e=>setAuthorForm({...authorForm,qualification:e.target.value})} placeholder="Высшая квалификационная категория"/></label><RichTextEditor label="Описание автора" value={authorForm.bio} onChange={bio=>setAuthorForm(x=>({...x,bio}))}/><label>Ссылка на фотографию (необязательно)<input value={authorForm.photo} onChange={e=>setAuthorForm({...authorForm,photo:e.target.value})} placeholder="https://..."/></label><button className="primary full" disabled={saving}>{saving?"Сохранение…":"Сохранить автора →"}</button></form></section><section className="admin-list-card"><div className="admin-card-heading"><h2>Авторы <span className="count-pill">{authors.length}</span></h2></div><div className="admin-material-list">{authors.map(a=><div className="admin-material" key={a.id}>{a.photo?<img src={a.photo}/>:<span className="author-avatar">{a.name.slice(0,1)}</span>}<div><b>{a.name}</b><span>{a.position||"Должность не указана"}</span><small>{materials.filter(m=>m.authorId===a.id || (!m.authorId && m.author===a.name)).length} публикаций</small></div><div className="admin-row-actions"><button onClick={()=>{setEditingAuthor(a.id);setAuthorForm({...a});}}>✎</button><button className="delete" onClick={()=>deleteAuthor(a)}>×</button></div></div>)}</div></section></div>}
  </main>;
}
export default function App() {
  const [materials,setMaterials] = useState([]);
  const [authors,setAuthors] = useState([]);
  const [loading,setLoading] = useState(true);
  const [route,setRoute] = useState({page:"home",param:null});
  const reload = async () => { const data = await request("/materials"); setMaterials(Array.isArray(data.items) ? data.items : []); };
  const reloadAuthors = async () => { const data = await request("/authors"); setAuthors(Array.isArray(data.items) ? data.items : []); };
  useEffect(() => { Promise.all([reload(),reloadAuthors()]).catch(console.error).finally(()=>setLoading(false)); }, []);
  const navigate = (page,param=null) => { setRoute({page,param}); window.scrollTo({top:0,behavior:"instant"}); };
  const selected = materials.find(x=>String(x.id)===String(route.param));
  let content;
  if (loading) content = <div className="loading page-shell">Загружаем цифровую копилку…</div>;
  else switch(route.page) {
    case "catalog": content=<Catalog materials={materials} authors={authors} navigate={navigate}/>; break;
    case "authors": content=<Authors materials={materials} authors={authors} navigate={navigate}/>; break;
    case "author": content=<AuthorPage authorId={route.param} authors={authors} materials={materials} navigate={navigate}/>; break;
    case "about": content=<About/>; break;
    case "material": content=<MaterialPage item={selected} authors={authors} navigate={navigate}/>; break;
    case "reader": content=<Reader item={selected} navigate={navigate}/>; break;
    case "admin": content=<Admin materials={materials} authors={authors} reload={reload} reloadAuthors={reloadAuthors} navigate={navigate}/>; break;
    default: content=<Home materials={materials} authors={authors} navigate={navigate}/>;
  }
  return <><Header page={route.page} navigate={navigate}/>{content}<Footer navigate={navigate}/></>;
}
