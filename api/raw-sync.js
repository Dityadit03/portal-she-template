/* Sinkron otomatis seluruh data aplikasi ke Google Sheet "Database Portal SHE (Raw Data)".
   Dipanggil oleh job pg_cron Supabase (tiap menit, hanya bila ada koleksi yang berubah) atau tombol admin.
   Body: { cols: ['daily','employees', ...] } atau { op: 'FULL' }. Env: SYNC_SECRET, GAS_UPLOAD_URL, GAS_SECRET. */
const { SUPABASE_URL, ANON } = require('./_auth');
const { TABS, COLS } = require('./_rawspec');

const TZ = 7 * 3600e3;
const ts = v => { const d = new Date(+v + TZ); return d.toISOString().slice(0, 16).replace('T', ' '); };
const TIMEKEYS = new Set(['created', 'updated', 'at']);
function cell(k, v) {
  if (v == null || v === '') return '';
  if (TIMEKEYS.has(k) && typeof v === 'number' && v > 1e11) return ts(v);
  if (Array.isArray(v)) return v.every(x => x == null || typeof x !== 'object') ? v.filter(x => x != null && x !== '').join(', ') : JSON.stringify(v);
  if (typeof v === 'object') {
    const ks = Object.keys(v);
    if (ks.every(x => v[x] == null || typeof v[x] !== 'object')) return ks.map(x => `${x}: ${v[x] == null ? '' : v[x]}`).join('; ');
    return JSON.stringify(v);
  }
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
  if (typeof v === 'string') { const s = v.length > 45000 ? v.slice(0, 45000) + '…' : v; return /^[=+@]/.test(s) ? "'" + s : s; }
  return v;
}
function buildTab(t, docs) {
  let list = docs.filter(d => !t.where || t.where(d));
  const known = new Set(['id', ...t.cols.map(c => c[0]), ...(t.skip || [])]);
  let cols = t.cols.slice();
  if (t.long) {
    const rows = [];
    list.forEach(d => { const o = d[t.long] || {}; Object.keys(o).forEach(tr => rows.push(Object.assign({}, d, { training: tr, nilai: o[tr] }))); });
    list = rows;
  } else {
    /* objek yang dipecah jadi kolom sendiri (mis. permit.jenis) */
    (t.flat || []).forEach(p => {
      const sub = new Set(); list.forEach(d => { if (d[p] && typeof d[p] === 'object' && !Array.isArray(d[p])) Object.keys(d[p]).forEach(k => sub.add(k)); });
      [...sub].sort().forEach(k => cols.push([p + '.' + k, p[0].toUpperCase() + p.slice(1) + ' · ' + k]));
      known.add(p);
    });
    /* field baru yang belum ada di spesifikasi tetap ikut */
    const extra = new Set(); list.forEach(d => Object.keys(d).forEach(k => { if (!known.has(k) && !k.startsWith('_')) extra.add(k); }));
    [...extra].sort().forEach(k => cols.push([k, k]));
  }
  const get = (d, k) => { if (k.includes('.')) { const [a, b] = k.split('.'); return d[a] && d[a][b]; } return d[k]; };
  const key = d => String(get(d, t.sort) == null ? '' : get(d, t.sort));
  list.sort((a, b) => t.asc ? key(a).localeCompare(key(b)) || String(a.id).localeCompare(String(b.id)) : key(b).localeCompare(key(a)) || String(b.id).localeCompare(String(a.id)));
  const header = (t.long ? [] : ['ID']).concat(cols.map(c => c[1]));
  const rows = list.map(d => (t.long ? [] : [d.id]).concat(cols.map(c => cell(c[0], get(d, c[0])))));
  return { name: t.name, menu: t.menu, header, rows };
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const S = process.env.SYNC_SECRET, GAS = process.env.GAS_UPLOAD_URL, GS = process.env.GAS_SECRET;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!S || req.headers['x-sync-secret'] !== S) return res.status(403).json({ error: 'forbidden' });
  if (!GAS || !GS) return res.status(503).json({ error: 'GAS belum diatur' });
  const b = req.body || {};
  const want = b.op === 'FULL' ? COLS : COLS.filter(c => (b.cols || []).includes(c));
  if (!want.length) return res.status(200).json({ ok: true, tabs: 0 });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/raw_export`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_secret: S, p_cols: want }) });
    if (!r.ok) throw new Error('export ' + r.status);
    const db = await r.json();
    const tabs = TABS.filter(t => want.includes(t.col)).map(t => buildTab(t, db[t.col] || []));
    const index = TABS.map(t => ({ name: t.name, menu: t.menu }));
    const payload = JSON.stringify({ secret: GS, action: 'raw', tabs, index, full: b.op === 'FULL' });
    let j = null, err = '';
    for (let i = 0; i < 2 && !j; i++) {
      try { const g = await fetch(GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, redirect: 'follow' }); const t = await g.text(); try { j = JSON.parse(t); } catch (e) { err = 'jawaban Apps Script tidak valid'; } } catch (e) { err = 'Apps Script tidak menjawab'; }
    }
    if (!j) return res.status(502).json({ error: err });
    if (j.error) return res.status(502).json({ error: j.error });
    return res.status(200).json(Object.assign({ ok: true, tabs: tabs.length }, j));
  } catch (e) { return res.status(500).json({ error: String(e && e.message || e).slice(0, 200) }); }
};
module.exports.config = { maxDuration: 60 };
module.exports._buildTab = buildTab;
