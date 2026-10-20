export default async function handler(req, res) {
  const key = process.env.GDRIVE_API_KEY;
  const folder = req.query.folder || process.env.GDRIVE_ROOT_FOLDER_ID;
  if (!key || !folder) return res.status(500).json({ error: "Configure GDRIVE_API_KEY e GDRIVE_ROOT_FOLDER_ID" });
  if (!/^[\w-]+$/.test(folder)) return res.status(400).json({ error: "folder invalido" });
  let files = [], token = "";
  do {
    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.searchParams.set("q", `'${folder}' in parents and trashed=false`);
    u.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,thumbnailLink)");
    u.searchParams.set("pageSize", "1000");
    u.searchParams.set("orderBy", "name_natural");
    u.searchParams.set("key", key);
    if (token) u.searchParams.set("pageToken", token);
    const r = await fetch(u);
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: j.error?.message || "erro drive" });
    files = files.concat(j.files || []);
    token = j.nextPageToken || "";
  } while (token);

  const clean = n => n.replace(/\.[^.]+$/, "");
  const imgs = files.filter(f => f.mimeType.startsWith("image/"));
  const coverOf = name => imgs.find(i => clean(i.name).toLowerCase() === clean(name).toLowerCase());
  const img = f => f && `https://lh3.googleusercontent.com/d/${f.id}=w500`;
  const folderCover = img(imgs.find(i => /^(capa|cover|poster)$/i.test(clean(i.name))));

  const folders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder")
    .map(f => ({ id: f.id, title: f.name, cover: img(coverOf(f.name)) }));
  const videos = files.filter(f => f.mimeType.startsWith("video/"))
    .map(f => ({ id: f.id, title: clean(f.name), cover: img(coverOf(f.name)) || f.thumbnailLink || null }));
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.json({ cover: folderCover, folders, videos });
}
