export default async function handler(req, res) {
  const key = process.env.GDRIVE_API_KEY;
  const folder = req.query.folder || process.env.GDRIVE_ROOT_FOLDER_ID;
  if (!key || !folder) return res.status(500).json({ error: "Configure GDRIVE_API_KEY e GDRIVE_ROOT_FOLDER_ID" });
  if (!/^[\w-]+$/.test(folder)) return res.status(400).json({ error: "folder invalido" });

  async function listByQuery(q) {
    let out = [], token = "";
    do {
      const u = new URL("https://www.googleapis.com/drive/v3/files");
      u.searchParams.set("q", q);
      u.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,thumbnailLink,parents)");
      u.searchParams.set("pageSize", "1000");
      u.searchParams.set("orderBy", "name_natural");
      u.searchParams.set("key", key);
      if (token) u.searchParams.set("pageToken", token);
      const r = await fetch(u);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || "erro drive");
      out = out.concat(j.files || []);
      token = j.nextPageToken || "";
    } while (token);
    return out;
  }

  const clean = n => n.replace(/\.[^.]+$/, "");
  const stripTags = n => clean(n).replace(/^(?:\[[^\]]+\]\s*)+/, "");
  const norm = n => stripTags(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const img = f => f && `https://lh3.googleusercontent.com/d/${f.id}=w500`;

  const CAT_ALIASES = {
    filmes: "Filmes", filme: "Filmes",
    series: "Séries", serie: "Séries",
    novelas: "Novelas", novela: "Novelas",
    novelinhas: "Novelinhas", novelinha: "Novelinhas",
    animes: "Animes", anime: "Animes"
  };

  const SUB_ALIASES = {
    "em alta": "Em Alta", emalta: "Em Alta", destaque: "Em Alta", destaques: "Em Alta", top: "Em Alta",
    acao: "Ação", aventura: "Aventura", comedia: "Comédia", drama: "Drama",
    terror: "Terror", suspense: "Suspense", romance: "Romance",
    ficcao: "Ficção Científica", "ficcao cientifica": "Ficção Científica", scifi: "Ficção Científica",
    animacao: "Animação", infantil: "Animação", documentario: "Documentário", documentarios: "Documentário",
    policial: "Policial", crime: "Policial", nacional: "Nacionais", nacionais: "Nacionais",
    dorama: "Doramas", doramas: "Doramas"
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

    const innerCoverByFolder = {};
    const missingFolders = subFolders.filter(f => !coverOf(f.name));
    if (missingFolders.length > 0) {
      try {
        for (let i = 0; i < missingFolders.length; i += 25) {
          const ch = missingFolders.slice(i, i + 25);
          const parentsOr = ch.map(f => `'${f.id}' in parents`).join(" or ");
          const subImgs = await listByQuery(`(${parentsOr}) and mimeType contains 'image/' and trashed=false`);
          const byParent = {};
          for (const si of subImgs) {
            const pid = si.parents && si.parents[0];
            if (pid) (byParent[pid] = byParent[pid] || []).push(si);
          }
          for (const f of ch) {
            const list = byParent[f.id] || [];
            const chosen = list.find(i => /^(capa|cover|poster)$/i.test(clean(i.name))) || list.find(i => norm(i.name) === norm(f.name)) || list[0];
            if (chosen) innerCoverByFolder[f.id] = img(chosen);
          }
        }
      } catch {}
    }

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

    res.setHeader("Cache-Control", req.query.t ? "no-store" : "s-maxage=120, stale-while-revalidate=600");
    return res.json({ cover: folderCover, folders, videos });
  }

  // MODO CATALOGO (Raiz): desce automaticamente em pastas de Categoria (Filmes, Series, Novelas, Novelinhas, Animes)
  // e tambem em pastas de Subcategoria (Acao, Comedia, Drama, etc.) para montar o catalogo unificado!
  const rootImgs = files.filter(f => f.mimeType.startsWith("image/"));
  const rootFolders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  const rootVideos = files.filter(f => f.mimeType.startsWith("video/"));

  const catFolders = [];
  const directFolders = [];
  for (const rf of rootFolders) {
    const mc = resolveMainCat(rf.name);
    if (mc) catFolders.push({ ...rf, mainCat: mc });
    else directFolders.push(rf);
  }

  let level1Files = [];
  if (catFolders.length > 0) {
    try {
      const parentsOr = catFolders.map(f => `'${f.id}' in parents`).join(" or ");
      level1Files = await listByQuery(`(${parentsOr}) and trashed=false`);
    } catch {}
  }

  const catById = {};
  for (const cf of catFolders) catById[cf.id] = cf.mainCat;

  // Verifica se dentro das pastas de Categoria ha pastas de Subcategoria (ex: Filmes -> Acao)
  const subCatFolders = [];
  const level1Shows = [];
  const level1Imgs = [];
  const level1Videos = [];

  for (const f of level1Files) {
    const pid = f.parents && f.parents[0];
    const parentCat = catById[pid] || "";
    if (f.mimeType.startsWith("image/")) {
      level1Imgs.push(f);
    } else if (f.mimeType.startsWith("video/")) {
      level1Videos.push({ ...f, parentCat, parentSub: "" });
    } else if (f.mimeType === "application/vnd.google-apps.folder") {
      const sc = resolveSubCat(f.name);
      if (sc) subCatFolders.push({ ...f, mainCat: parentCat, subCat: sc });
      else level1Shows.push({ ...f, parentCat, parentSub: "" });
    }
  }

  let level2Files = [];
  if (subCatFolders.length > 0) {
    try {
      const parentsOr = subCatFolders.map(f => `'${f.id}' in parents`).join(" or ");
      level2Files = await listByQuery(`(${parentsOr}) and trashed=false`);
    } catch {}
  }

  const subCatById = {};
  for (const sf of subCatFolders) subCatById[sf.id] = sf;

  const level2Shows = [];
  const level2Imgs = [];
  const level2Videos = [];
  for (const f of level2Files) {
    const pid = f.parents && f.parents[0];
    const pInfo = subCatById[pid];
    if (!pInfo) continue;
    if (f.mimeType.startsWith("image/")) level2Imgs.push(f);
    else if (f.mimeType.startsWith("video/")) level2Videos.push({ ...f, parentCat: pInfo.mainCat, parentSub: pInfo.subCat });
    else if (f.mimeType === "application/vnd.google-apps.folder") level2Shows.push({ ...f, parentCat: pInfo.mainCat, parentSub: pInfo.subCat });
  }

  const allImgs = [...rootImgs, ...level1Imgs, ...level2Imgs];
  const findCoverByName = name => allImgs.find(i => norm(i.name) === norm(name));

  const allShowFolders = [
    ...directFolders.map(f => ({ ...f, parentCat: "", parentSub: "" })),
    ...level1Shows,
    ...level2Shows
  ];

  // Busca capas internas das pastas de novelas/series/filmes
  const innerCoverByFolder = {};
  const missing = allShowFolders.filter(f => !findCoverByName(f.name));
  if (missing.length > 0) {
    try {
      for (let i = 0; i < missing.length; i += 25) {
        const ch = missing.slice(i, i + 25);
        const parentsOr = ch.map(f => `'${f.id}' in parents`).join(" or ");
        const subImgs = await listByQuery(`(${parentsOr}) and mimeType contains 'image/' and trashed=false`);
        const byParent = {};
        for (const si of subImgs) {
          const pid = si.parents && si.parents[0];
          if (pid) (byParent[pid] = byParent[pid] || []).push(si);
        }
        for (const f of ch) {
          const list = byParent[f.id] || [];
          const chosen = list.find(i => /^(capa|cover|poster)$/i.test(clean(i.name))) || list.find(i => norm(i.name) === norm(f.name)) || list[0];
          if (chosen) innerCoverByFolder[f.id] = img(chosen);
        }
      }
    } catch {}
  }

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
        else if (sc) { if (!subs.includes(sc)) subs.push(sc); }
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

  res.setHeader("Cache-Control", req.query.t ? "no-store" : "s-maxage=120, stale-while-revalidate=600");
  res.json({ folders: outFolders, videos: outVideos });
}
