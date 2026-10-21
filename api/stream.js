import { Readable } from "node:stream";
export const config = { maxDuration: 30 };
const CHUNK = 8 * 1024 * 1024;
export default async function handler(req, res) {
  const key = process.env.GDRIVE_API_KEY, id = req.query.id;
  if (!key || !id || !/^[\w-]+$/.test(id)) return res.status(400).end("bad request");
  const isBook = req.query.type === "pdf" || req.query.type === "book";
  const rangeHeader = req.headers.range || "";

  if (isBook && !rangeHeader) {
    const up = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${key}`);
    if (!up.ok) return res.status(up.status).end(await up.text());
    res.status(200);
    res.setHeader("Content-Type", up.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    const cl = up.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return Readable.fromWeb(up.body).pipe(res);
  }

  let start = 0, end;
  const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (m) { start = +m[1]; end = m[2] ? +m[2] : undefined; }
  const cap = start + CHUNK - 1;
  end = end === undefined ? cap : Math.min(end, cap);
  const up = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${key}`, { headers: { Range: `bytes=${start}-${end}` } });
  if (!up.ok && up.status !== 206) return res.status(up.status).end(await up.text());
  res.status(206);
  res.setHeader("Content-Type", up.headers.get("content-type") || (isBook ? "application/pdf" : "video/mp4"));
  res.setHeader("Accept-Ranges", "bytes");
  const cr = up.headers.get("content-range");
  if (cr) res.setHeader("Content-Range", cr);
  const cl = up.headers.get("content-length");
  if (cl) res.setHeader("Content-Length", cl);
  res.setHeader("Cache-Control", "public, max-age=3600");
  Readable.fromWeb(up.body).pipe(res);
}
