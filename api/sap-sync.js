/* Sinkron otomatis SAP ke Google Sheet "Database SAP Portal SHE".
   Dipanggil oleh trigger database Supabase (pg_net) setiap ada perubahan formulir Observasi / Inspeksi / Hazard,
   peserta SAP, status cuti, arsip minggu, atau pengaturan kalender. Env: SYNC_SECRET, GAS_UPLOAD_URL, GAS_SECRET. */
const { SUPABASE_URL, ANON } = require('./_auth');
const { make, TYPE, SEC } = require('./_sapcore');
const JENIS = { hazard: 'Hazard report', observasi: 'Observasi (PTO)', inspeksi: 'Inspeksi' };
const pc = v => (v == null || isNaN(v) ? 'N/A' : Math.round(v * 1000) / 1000);

async function exportDb(secret) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sap_export`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_secret: secret }) });
  if (!r.ok) throw new Error('export ' + r.status);
  return r.json();
}
function lapRow(id, d, C, pidOf) {
  const w = C.ws(d.tanggal); const pid = pidOf(d);
  return [id, w ? 'W' + C.wno(w) : '', w, d.tanggal || '', JENIS[d.type] || d.type, d.nama || '', d.nik || '', d.dept || '', d.lokasi || '',
    String(d.pekerjaan || d.objek || d.deskripsi || '').slice(0, 300), [d.hasil, d.jenis, d.status].filter(Boolean).join(' · '), d.fileUrl || '', pid ? pid.nama : '(bukan peserta SAP)', new Date(d.updated || d.created || Date.now()).toISOString()];
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const S = process.env.SYNC_SECRET, GAS = process.env.GAS_UPLOAD_URL, GS = process.env.GAS_SECRET;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!S || req.headers['x-sync-secret'] !== S) return res.status(403).json({ error: 'forbidden' });
  if (!GAS || !GS) return res.status(503).json({ error: 'GAS belum diatur' });
  const b = req.body || {};
  try {
    const db = await exportDb(S);
    const C = make(db);
    const byNik = {}, byName = {};
    (db.people || []).forEach(p => { if (p.nik) byNik[String(p.nik).trim()] = p; byName[String(p.nama || '').trim().toLowerCase()] = p; (p.alias || []).forEach(a => { byName[String(a).trim().toLowerCase()] = p; }); });
    const pidOf = d => (d.nik && byNik[String(d.nik).trim()]) || byName[String(d.nama || '').trim().toLowerCase()];
    const now = C.now();
    /* minggu yang perlu dihitung ulang: minggu terdampak + minggu berikutnya dalam bulan yang sama, dan minggu berjalan */
    const set = new Set([now]);
    const addFrom = w => { if (!w) return; const m = C.month(w); for (let x = w; x <= now && C.month(x) === m; x = C.add(x, 1)) set.add(x); };
    const raw = [];
    if (b.op === 'FULL') {
      const first = Object.keys(db.rec || {}).map(k => k.slice(0, 10)).sort()[0] || C.add(now, -8);
      for (let x = first; x <= now; x = C.add(x, 1)) set.add(x);
      (db.daily || []).forEach(d => raw.push({ op: 'upsert', id: d.id, row: lapRow(d.id, d, C, pidOf) }));
    } else if (b.col === 'daily') {
      const d = b.data, o = b.old || {};
      if (b.op === 'DELETE' || !d || !TYPE[d.type]) raw.push({ op: 'delete', id: b.id }); else raw.push({ op: 'upsert', id: b.id, row: lapRow(b.id, d, C, pidOf) });
      addFrom(d && C.ws(d.tanggal)); addFrom(o.tanggal && C.ws(o.tanggal));
    } else if (b.col === 'sap_rec') addFrom(String(b.id || '').slice(0, 10));
    else if (b.col === 'sap_week') addFrom(String(b.id || '').slice(0, 10));
    else if (b.col === 'sap_people') { const p = b.data || b.old || {}; (p.riwayat || []).slice(-1).forEach(l => addFrom(l.ws)); }
    const weeks = [...set].filter(Boolean).sort();
    const rekap = [], ring = [];let perf = null;
    weeks.forEach(w => {
      const R = C.compute(w);
      R.rows.forEach(r => rekap.push([w + '|' + r.p.id, R.label, w, R.end, SEC[r.p.dept] || r.p.dept, C.lv(r.p), r.p.nama, r.p.nik || '', r.p.jabatan || '', r.cur.st,
        r.cur.obs[0], r.cur.obs[1], pc(r.wk.obs), r.cur.ins[0], r.cur.ins[1], pc(r.wk.ins), r.cur.haz[0], r.cur.haz[1], pc(r.wk.haz), r.cuti ? 'Cuti' : pc(r.wkSum),
        pc(r.ach.obs), pc(r.ach.ins), pc(r.ach.haz), r.cuti ? 'Cuti' : pc(r.sum), r.cur.src === 'live' ? 'Formulir portal' : r.cur.src === 'kunci' ? 'Dikunci' : 'Riwayat Excel']));
      const dm = Object.fromEntries(R.depts.map(x => [x.sec, x.sum]));
      ring.push([w, R.label, R.end, R.month, pc(R.site.sum), pc(R.site.obs), pc(R.site.ins), pc(R.site.haz), pc(R.site.wk), R.site.on, R.site.cuti, ...['PJO', 'HSE', 'PRO', 'PLANT', 'LOG', 'HRGA', 'ENG'].map(s => pc(dm[s])), new Date().toISOString()]);
      if (w === now || (!perf && w === weeks[weeks.length - 1])) perf = { ws: w, label: R.label, end: R.end, sec: R.depts.map(x => ({ sec: x.sec, A: [pc(x.tot.A.obs), pc(x.tot.A.ins), pc(x.tot.A.haz)], tot: { P: [pc(x.tot.P.obs), pc(x.tot.P.ins), pc(x.tot.P.haz)] },
        levels: x.levels.map(l => ({ k: l.k, on: l.on, n: l.n, P: [pc(l.P.obs), pc(l.P.ins), pc(l.P.haz)], A: [pc(l.A.obs), pc(l.A.ins), pc(l.A.haz)] })) })) };
    });
    const peserta = (db.people || []).filter(p => p.nama).map(p => { const t = p.target || {}; const out = p.aktif === false || !!p.selesai; const last = (p.riwayat || []).slice(-1)[0] || {};
      return [p.id, p.nama, p.nik || '', p.dept || '', SEC[p.dept] || '', C.lv(p), p.jabatan || '', +t.obs || 0, +t.ins || 0, +t.haz || 0, out ? 'Keluar' : 'Aktif', p.mulai ? 'W' + C.wno(p.mulai) : '', p.selesai ? 'W' + C.wno(p.selesai) : '', last.alasan || '']; });
    const payload = JSON.stringify({ secret: GS, action: 'sap', raw, rekap, weeks, ring, perf, peserta });
    let j = null, err = '';
    for (let i = 0; i < 2 && !j; i++) {
      try { const r = await fetch(GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, redirect: 'follow' }); const t = await r.text(); try { j = JSON.parse(t); } catch (e) { err = 'jawaban Apps Script tidak valid'; } } catch (e) { err = 'Apps Script tidak menjawab'; }
    }
    if (!j) return res.status(502).json({ error: err });
    if (j.error) return res.status(502).json({ error: j.error });
    return res.status(200).json(Object.assign({ ok: true, weeks: weeks.length, raw: raw.length }, j));
  } catch (e) { return res.status(500).json({ error: String(e && e.message || e).slice(0, 200) }); }
};
module.exports.config = { maxDuration: 60 };
