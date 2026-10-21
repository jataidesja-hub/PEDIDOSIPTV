export default async function handler(req, res) {
  const key = process.env.GDRIVE_API_KEY;
  const folder = req.query.folder || process.env.GDRIVE_ROOT_FOLDER_ID;
  if (!key || !folder) return res.status(500).json({ error: "Configure GDRIVE_API_KEY e GDRIVE_ROOT_FOLDER_ID" });
  if (!/^[\w-]+$/.test(folder)) return res.status(400).json({ error: "folder invalido" });

  async function listByQuery(q, maxItems = 0) {
    let out = [], token = "";
    do {
      const u = new URL("https://www.googleapis.com/drive/v3/files");
      u.searchParams.set("q", q);
      u.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,thumbnailLink,parents)");
      u.searchParams.set("pageSize", maxItems > 0 ? String(maxItems) : "1000");
      u.searchParams.set("orderBy", "name_natural");
      u.searchParams.set("key", key);
      if (token) u.searchParams.set("pageToken", token);
      const r = await fetch(u);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || "erro drive");
      out = out.concat(j.files || []);
      if (maxItems > 0 && out.length >= maxItems) break;
      token = j.nextPageToken || "";
    } while (token);
    return out;
  }

  const clean = n => n.replace(/\.[^.]+$/, "");
  const stripTags = n => clean(n).replace(/^(?:\[[^\]]+\]\s*)+/, "");
  const norm = n => stripTags(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const img = f => f && `https://lh3.googleusercontent.com/d/${f.id}=w500`;

  async function fetchInnerCovers(folderList) {
    const map = {};
    const batchSize = 10;
    for (let i = 0; i < folderList.length; i += batchSize) {
      const batch = folderList.slice(i, i + batchSize);
      await Promise.all(batch.map(async f => {
        try {
          const list = await listByQuery(`'${f.id}' in parents and (mimeType contains 'image/' or mimeType = 'application/pdf') and trashed=false`, 10);
          const imgsOnly = list.filter(im => im.mimeType && im.mimeType.startsWith("image/"));
          const chosen = imgsOnly.find(im => /^(capa|cover|poster)$/i.test(clean(im.name)))
            || imgsOnly.find(im => norm(im.name) === norm(f.name))
            || imgsOnly[0]
            || list.find(im => im.mimeType === "application/pdf");
          if (chosen) map[f.id] = img(chosen);
        } catch {}
      }));
    }
    return map;
  }

  const BOOK_EXT_RE = /\.(pdf|epub|cbz|txt|md|docx)$/i;
  const BOOK_MIMES = new Set([
    "application/pdf",
    "application/epub+zip",
    "application/vnd.comicbook+zip",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  const isPdf = f => BOOK_MIMES.has(f.mimeType) || BOOK_EXT_RE.test(f.name || "");
  function getBookFormat(f) {
    const m = /\.([a-z0-9]+)$/i.exec(f.name || "");
    if (m) return m[1].toLowerCase();
    if (f.mimeType === "application/epub+zip") return "epub";
    if (f.mimeType === "application/vnd.comicbook+zip") return "cbz";
    if (f.mimeType === "text/plain") return "txt";
    if (f.mimeType === "text/markdown") return "md";
    if (f.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
    return "pdf";
  }

  const CAT_ALIASES = {
    filmes: "Filmes", filme: "Filmes",
    series: "Séries", serie: "Séries",
    novelas: "Novelas", novela: "Novelas",
    novelinhas: "Novelinhas", novelinha: "Novelinhas",
    animes: "Animes", anime: "Animes",
    biblioteca: "Biblioteca", bliblioteca: "Biblioteca", livros: "Biblioteca", livro: "Biblioteca", pdf: "Biblioteca", pdfs: "Biblioteca"
  };

  const SUB_ALIASES = {
    todas: "__ALL__", todos: "__ALL__",
    "em alta": "Em Alta", emalta: "Em Alta", destaque: "Em Alta", destaques: "Em Alta", top: "Em Alta",
    acao: "Ação", aventura: "Aventura", comedia: "Comédia", drama: "Drama",
    terror: "Terror", suspense: "Suspense", romance: "Romance",
    ficcao: "Ficção Científica", "ficcao cientifica": "Ficção Científica", scifi: "Ficção Científica",
    animacao: "Animação", infantil: "Animação", documentario: "Documentário", documentarios: "Documentário",
    policial: "Policial", crime: "Policial", nacional: "Nacionais", nacionais: "Nacionais",
    dorama: "Doramas", doramas: "Doramas",
    autoajuda: "Autoajuda", "auto ajuda": "Autoajuda", desenvolvimento: "Autoajuda",
    financas: "Finanças & Negócios", negocios: "Finanças & Negócios", "financas e negocios": "Finanças & Negócios", economia: "Finanças & Negócios",
    biografia: "Biografia", biografias: "Biografia",
    fantasia: "Fantasia",
    estudos: "Estudos", educacao: "Estudos", academico: "Estudos", apostilas: "Estudos",
    religiao: "Religião", espiritualidade: "Religião", evangelico: "Religião", catolico: "Religião",
    quadrinhos: "Quadrinhos & Mangás", hq: "Quadrinhos & Mangás", hqs: "Quadrinhos & Mangás", manga: "Quadrinhos & Mangás", mangas: "Quadrinhos & Mangás"
  };

  function resolveMainCat(raw) {
    return CAT_ALIASES[norm(raw)] || null;
  }
  function resolveSubCat(raw) {
    return SUB_ALIASES[norm(raw)] || null;
  }

  let files = [];
  try {
    files = await listByQuery(`'${folder}' in parents and trashed=false`);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const isCatalog = req.query.mode === "catalog";

  if (!isCatalog) {
    const imgs = files.filter(f => f.mimeType.startsWith("image/"));
    const coverOf = name => imgs.find(i => norm(i.name) === norm(name));
    const folderCover = img(imgs.find(i => /^(capa|cover|poster)$/i.test(clean(i.name))) || (imgs.length === 1 ? imgs[0] : null));
    const subFolders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");

    const missingFolders = subFolders.filter(f => !coverOf(f.name));
    const innerCoverByFolder = missingFolders.length > 0 ? await fetchInnerCovers(missingFolders) : {};

    const folders = subFolders.map(f => ({
      id: f.id,
      title: stripTags(f.name),
      rawTitle: f.name,
      cover: img(coverOf(f.name)) || innerCoverByFolder[f.id] || null
    }));
    const videos = files.filter(f => f.mimeType.startsWith("video/")).map(f => ({
      id: f.id,
      title: stripTags(f.name),
      rawTitle: clean(f.name),
      cover: img(coverOf(f.name)) || folderCover || f.thumbnailLink || null
    }));
    const books = files.filter(isPdf).map(f => {
      const ext = getBookFormat(f);
      return {
        id: f.id,
        title: stripTags(f.name),
        rawTitle: clean(f.name),
        ext,
        cover: img(coverOf(f.name)) || folderCover || (f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+.*$/, "=s500") : (ext === "pdf" ? img(f) : null))
      };
    });

    res.setHeader("Cache-Control", req.query.t ? "no-store" : "s-maxage=120, stale-while-revalidate=600");
    return res.json({ cover: folderCover, folders, videos, books });
  }

  // MODO CATALOGO (Raiz): desce automaticamente em pastas de Categoria (Filmes, Series, Novelas, Novelinhas, Animes, Biblioteca)
  // e tambem em pastas de Subcategoria (Acao, Comedia, Drama, etc.) para montar o catalogo unificado!
  const rootImgs = files.filter(f => f.mimeType.startsWith("image/"));
  const rootFolders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  const rootVideos = files.filter(f => f.mimeType.startsWith("video/"));
  const rootBooks = files.filter(isPdf);

  const catFolders = [];
  const directFolders = [];
  for (const rf of rootFolders) {
    const mc = resolveMainCat(rf.name);
    if (mc) catFolders.push({ ...rf, mainCat: mc });
    else directFolders.push(rf);
  }

  // Consulta cada pasta de categoria individualmente em paralelo (Google Drive API key exige 1 parent por query)
  const subCatFolders = [];
  const level1Shows = [];
  const level1Imgs = [];
  const level1Videos = [];
  const level1Books = [];

  if (catFolders.length > 0) {
    await Promise.all(catFolders.map(async cf => {
      try {
        const children = await listByQuery(`'${cf.id}' in parents and trashed=false`);
        const parentCat = cf.mainCat;
        for (const f of children) {
          if (f.mimeType.startsWith("image/")) {
            level1Imgs.push(f);
          } else if (f.mimeType.startsWith("video/")) {
            level1Videos.push({ ...f, parentCat, parentSub: "" });
          } else if (isPdf(f)) {
            level1Books.push({ ...f, parentCat: parentCat || "Biblioteca", parentSub: "" });
          } else if (f.mimeType === "application/vnd.google-apps.folder") {
            const sc = resolveSubCat(f.name);
            if (sc) subCatFolders.push({ ...f, mainCat: parentCat, subCat: sc });
            else level1Shows.push({ ...f, parentCat, parentSub: "" });
          }
        }
      } catch {}
    }));
  }

  const level2Shows = [];
  const level2Imgs = [];
  const level2Videos = [];
  const level2Books = [];

  if (subCatFolders.length > 0) {
    await Promise.all(subCatFolders.map(async sf => {
      try {
        const children = await listByQuery(`'${sf.id}' in parents and trashed=false`);
        const pSub = sf.subCat === "__ALL__" ? "" : sf.subCat;
        for (const f of children) {
          if (f.mimeType.startsWith("image/")) {
            level2Imgs.push(f);
          } else if (f.mimeType.startsWith("video/")) {
            level2Videos.push({ ...f, parentCat: sf.mainCat, parentSub: pSub });
          } else if (isPdf(f)) {
            level2Books.push({ ...f, parentCat: sf.mainCat || "Biblioteca", parentSub: pSub });
          } else if (f.mimeType === "application/vnd.google-apps.folder") {
            level2Shows.push({ ...f, parentCat: sf.mainCat, parentSub: pSub });
          }
        }
      } catch {}
    }));
  }

  const allImgs = [...rootImgs, ...level1Imgs, ...level2Imgs];
  const findCoverByName = name => allImgs.find(i => norm(i.name) === norm(name));

  const allShowFolders = [
    ...directFolders.map(f => ({ ...f, parentCat: "", parentSub: "" })),
    ...level1Shows,
    ...level2Shows
  ];

  // Busca capas internas das pastas de novelas/series/filmes
  const missing = allShowFolders.filter(f => !findCoverByName(f.name));
  const innerCoverByFolder = missing.length > 0 ? await fetchInnerCovers(missing) : {};

  function extractTags(rawName, fallbackCat, fallbackSub) {
    let cat = fallbackCat || "";
    let subs = fallbackSub ? [fallbackSub] : [];
    const brackets = [...rawName.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
    for (const b of brackets) {
      const parts = b.split(/[/|>,-]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        const mc = resolveMainCat(p);
        const sc = resolveSubCat(p);
        if (mc) cat = mc;
        else if (sc && sc !== "__ALL__") { if (!subs.includes(sc)) subs.push(sc); }
        else if (!cat) cat = p;
        else if (!subs.includes(p)) subs.push(p);
      }
    }
    return { cat, sub: subs.join(", "), subs, cleanTitle: stripTags(rawName) };
  }

  const outFolders = allShowFolders.map(f => {
    const info = extractTags(f.name, f.parentCat, f.parentSub);
    return {
      id: f.id,
      title: info.cleanTitle,
      cat: info.cat,
      sub: info.sub,
      subs: info.subs,
      cover: img(findCoverByName(f.name)) || innerCoverByFolder[f.id] || null
    };
  });

  const allVideos = [
    ...rootVideos.map(v => ({ ...v, parentCat: "", parentSub: "" })),
    ...level1Videos,
    ...level2Videos
  ];

  const outVideos = allVideos.map(v => {
    const info = extractTags(clean(v.name), v.parentCat, v.parentSub);
    return {
      id: v.id,
      title: info.cleanTitle,
      cat: info.cat,
      sub: info.sub,
      subs: info.subs,
      cover: img(findCoverByName(v.name)) || v.thumbnailLink || null
    };
  });

  const allBooks = [
    ...rootBooks.map(b => ({ ...b, parentCat: "Biblioteca", parentSub: "" })),
    ...level1Books,
    ...level2Books
  ];

  const outBooks = allBooks.map(b => {
    const info = extractTags(clean(b.name), b.parentCat || "Biblioteca", b.parentSub);
    const ext = getBookFormat(b);
    return {
      id: b.id,
      title: info.cleanTitle,
      cat: info.cat || "Biblioteca",
      sub: info.sub,
      subs: info.subs,
      ext,
      cover: img(findCoverByName(b.name)) || (b.thumbnailLink ? b.thumbnailLink.replace(/=s\d+.*$/, "=s500") : (ext === "pdf" ? img(b) : null))
    };
  });

  res.setHeader("Cache-Control", req.query.t ? "no-store" : "s-maxage=120, stale-while-revalidate=600");
  res.json({ folders: outFolders, videos: outVideos, books: outBooks });
}
