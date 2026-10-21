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

  let files = [];
  try {
    files = await listByQuery(`'${folder}' in parents and trashed=false`);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const clean = n => n.replace(/\.[^.]+$/, "");
  const stripCat = n => clean(n).replace(/^\[[^\]]+\]\s*/, "");
  const norm = n => stripCat(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

  const imgs = files.filter(f => f.mimeType.startsWith("image/"));
  const coverOf = name => imgs.find(i => norm(i.name) === norm(name));
  const img = f => f && `https://lh3.googleusercontent.com/d/${f.id}=w500`;
  const folderCover = img(imgs.find(i => /^(capa|cover|poster)$/i.test(clean(i.name))) || (imgs.length === 1 ? imgs[0] : null));

  const subFolders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");

  // Busca imagens que estao DENTRO das subpastas para usar automaticamente como capa da subpasta
  const innerCoverByFolder = {};
  const missingFolders = subFolders.filter(f => !coverOf(f.name));
  if (missingFolders.length > 0) {
    try {
      const chunks = [];
      for (let i = 0; i < missingFolders.length; i += 25) {
        chunks.push(missingFolders.slice(i, i + 25));
      }
      for (const ch of chunks) {
        const parentsOr = ch.map(f => `'${f.id}' in parents`).join(" or ");
        const qImgs = `(${parentsOr}) and mimeType contains 'image/' and trashed=false`;
        const subImgs = await listByQuery(qImgs);
        const byParent = {};
        for (const si of subImgs) {
          const pid = si.parents && si.parents[0];
          if (!pid) continue;
          if (!byParent[pid]) byParent[pid] = [];
          byParent[pid].push(si);
        }
        for (const f of ch) {
          const list = byParent[f.id] || [];
          if (list.length === 0) continue;
          const chosen =
            list.find(i => /^(capa|cover|poster)$/i.test(clean(i.name))) ||
            list.find(i => norm(i.name) === norm(f.name)) ||
            list[0];
          if (chosen) innerCoverByFolder[f.id] = img(chosen);
        }
      }
    } catch {}
  }

  const folders = subFolders.map(f => ({
    id: f.id,
    title: f.name,
    cover: img(coverOf(f.name)) || innerCoverByFolder[f.id] || null
  }));
  const videos = files.filter(f => f.mimeType.startsWith("video/"))
    .map(f => ({ id: f.id, title: clean(f.name), cover: img(coverOf(f.name)) || folderCover || f.thumbnailLink || null }));

  res.setHeader("Cache-Control", req.query.t ? "no-store" : "s-maxage=120, stale-while-revalidate=600");
  res.json({ cover: folderCover, folders, videos });
}
