/* Upload file ke Google Drive lewat Google Apps Script milik pemilik Drive, lalu catat ke arsip portal (koleksi "files").
   Env: GAS_UPLOAD_URL, GAS_SECRET. */
const { getCaller, SUPABASE_URL } = require('./_auth');
/* Folder tujuan yang diizinkan = semua folder di portal.config.json bagian "drive" (kecuali folder induk & spreadsheet). */
const CFG = require('../portal.config.json');
const SKIP = new Set(['root', 'harian', 'pusat', 'campaign', 'smkp', 'env', 'sapdb', 'rawdb', 'log']);
const FOLDERS = Object.fromEntries(Object.entries(CFG.drive || {}).filter(([k, v]) => v && !SKIP.has(k)).map(([k, v]) => [v, k]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ code: 'bad_request', message: 'Metode tidak didukung' });
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ code: 'needs_reauth', message: 'Sesi berakhir, silakan masuk lagi.' });
  if (!['admin', 'user'].includes(caller.role)) return res.status(403).json({ code: 'blocked_by_policy', message: 'Peran Anda tidak boleh mengunggah file.' });
  const GAS = process.env.GAS_UPLOAD_URL, SECRET = process.env.GAS_SECRET;
  if (!GAS || !SECRET) return res.status(503).json({ code: 'server_not_connected', message: 'Upload Google Drive belum diatur (GAS_UPLOAD_URL / GAS_SECRET).' });
  const b = req.body || {};
  const kat = FOLDERS[String(b.parentId)];
  if (!kat) return res.status(400).json({ code: 'bad_request', message: 'Folder tujuan tidak diizinkan.' });
  const data = String(b.base64Content || '');
  if (!data || data.length > 4.2e6) return res.status(413).json({ code: 'too_big', message: 'File maksimal ±3 MB.' });
  const title = String(b.title || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180);
  if (!/\.[a-z0-9]{2,5}$/i.test(title)) return res.status(400).json({ code: 'bad_request', message: 'Nama file harus punya ekstensi.' });
  const payload = JSON.stringify({ secret: SECRET, title, parentId: b.parentId, mimeType: b.contentMimeType || 'application/octet-stream', data, convert: !b.disableConversionToGoogleType, by: caller.user.email, ref: String(b.ref || '').slice(0, 120) });
  let j = null, lastErr = '';
  for (let attempt = 0; attempt < 2 && !j; attempt++) {
    try {
      const r = await fetch(GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, redirect: 'follow' });
      const txt = await r.text();
      try { j = JSON.parse(txt); } catch (e) { lastErr = 'Jawaban Apps Script tidak valid'; j = null; }
    } catch (e) { lastErr = 'Google Drive tidak menjawab'; }
    if (!j && attempt === 0) await sleep(800);
  }
  if (!j) return res.status(502).json({ code: 'upstream_error', message: lastErr });
  if (j.error) return res.status(502).json({ code: 'tool_error', message: j.error });
  // catat ke arsip portal (gagal mencatat tidak membatalkan upload)
  try {
    const rec = { nama: j.name || title, url: j.url, fileId: j.id, kategori: j.kategori || kat, path: j.path || '', folderUrl: j.folderUrl || '', kb: j.kb || Math.round(data.length * 0.75 / 1024), tipe: b.contentMimeType || '', oleh: caller.user.email, olehNama: caller.nama || '', at: Date.now() };
    await fetch(`${SUPABASE_URL}/rest/v1/docs`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, caller.headers), body: JSON.stringify({ col: 'files', id: 'f-' + j.id, data: rec }) });
  } catch (e) { /* abaikan */ }
  return res.status(200).json({ id: j.id, viewUrl: j.url, name: j.name, path: j.path });
};
