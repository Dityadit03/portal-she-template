/* Perhitungan SAP di server (sama dengan src/sap-block.js di portal).
   Minggu Selasa–Senin; bulan MTD ditentukan hari Jumat; cuti tidak dihitung; Achv = min(Act/Plan,1), Plan 0 = 100%. */
const DAY = 864e5;
const DEPTS = ['Management (PJO)', 'HSE', 'Produksi', 'Plant', 'Logistik', 'HRGA', 'Engineering'];
const SEC = { 'Management (PJO)': 'PJO', HSE: 'HSE', Produksi: 'PRO', Plant: 'PLANT', Logistik: 'LOG', HRGA: 'HRGA', Engineering: 'ENG' };
const LV = ['PJO', 'DH', 'SH', 'FOR'];
const K = ['obs', 'ins', 'haz'];
const TYPE = { observasi: 'obs', inspeksi: 'ins', hazard: 'haz' };
const norm = s => String(s || '').trim().toLowerCase();
const uDate = s => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const uIso = t => new Date(t).toISOString().slice(0, 10);
const achv = (p, a) => (p > 0 ? Math.min((+a || 0) / p, 1) : 1);
const levelOf = j => { const n = norm(j); return /site manager|project manager|pjo/.test(n) ? 'PJO' : /dept head|head|suptend|superintend|^spt|manager/.test(n) ? 'DH' : /foreman|group leader|^gl\b|gl |leader|planner|pengawas teknis/.test(n) ? 'FOR' : 'SH'; };

function make(db) {
  const anchors = ((db.cfg && db.cfg.anchors) || [(require('../portal.config.json').sap || { start: '2026-10-13', week: 41 })]).filter(a => a && !isNaN(uDate(a.start))).sort((a, b) => uDate(a.start) - uDate(b.start));
  const base = uDate(anchors[0].start);
  const ws = d => { const t = uDate(d); return isNaN(t) ? '' : uIso(base + Math.floor((t - base) / (7 * DAY)) * 7 * DAY); };
  const add = (w, n) => uIso(uDate(w) + n * 7 * DAY);
  const month = w => uIso(uDate(w) + 3 * DAY).slice(0, 7);
  const wno = w => { const t = uDate(w); let a = anchors[0]; anchors.forEach(x => { if (uDate(x.start) <= t) a = x; }); return a.week + Math.round((t - uDate(a.start)) / (7 * DAY)); };
  const people = (db.people || []).filter(p => p && p.nama);
  const lv = p => p.level || levelOf(p.jabatan);
  const inRange = (p, w) => (!Array.isArray(p.periode) || !p.periode.length ? p.aktif !== false : p.periode.some(r => (!r.m || w >= r.m) && (!r.s || w < r.s)));
  const rec = db.rec || {}, week = db.week || {};
  /* indeks Act */
  const byNik = {}, byName = {};
  people.forEach(p => { if (p.nik) byNik[String(p.nik).trim()] = p.id; byName[norm(p.nama)] = p.id; (p.alias || []).forEach(a => { byName[norm(a)] = p.id; }); });
  const idx = {};
  (db.daily || []).forEach(r => { const k = TYPE[r.type]; if (!k || !r.tanggal) return; const pid = (r.nik && byNik[String(r.nik).trim()]) || byName[norm(r.nama)]; if (!pid) return;
    const key = ws(r.tanggal) + '|' + pid; const o = idx[key] || (idx[key] = { obs: 0, ins: 0, haz: 0 }); o[k]++; });
  const cutiList = (w, d = 0) => { if (week[w] && Array.isArray(week[w].cuti)) return week[w].cuti; const fr = Object.keys(rec).filter(k => k.startsWith(w + '_')); if (fr.length) return fr.filter(k => rec[k].status === 'Cuti').map(k => k.slice(11)); return d < 8 ? cutiList(add(w, -1), d + 1) : []; };
  const cell = (p, w) => { const r = rec[w + '_' + p.id]; if (r) return { st: r.status === 'Cuti' ? 'Cuti' : 'Onsite', obs: r.obs || [0, 0], ins: r.ins || [0, 0], haz: r.haz || [0, 0], src: r.src || 'rec' };
    const cuti = cutiList(w).includes(p.id); const a = idx[w + '|' + p.id] || { obs: 0, ins: 0, haz: 0 }; const t = p.target || {}; const pl = k => (cuti ? 0 : +t[k] || 0);
    return { st: cuti ? 'Cuti' : 'Onsite', obs: [pl('obs'), a.obs], ins: [pl('ins'), a.ins], haz: [pl('haz'), a.haz], src: 'live' }; };
  const row = (p, w) => { const cur = cell(p, w); const m = month(w); const weeks = []; for (let x = w; month(x) === m; x = add(x, -1)) weeks.unshift(x);
    const mtd = {}; K.forEach(k => { let P = 0, A = 0; weeks.forEach(x => { const c = cell(p, x); P += c.st === 'Cuti' ? 0 : +c[k][0] || 0; A += +c[k][1] || 0; }); mtd[k] = [P, A]; });
    const ach = {}, wk = {}; K.forEach(k => { ach[k] = achv(mtd[k][0], mtd[k][1]); wk[k] = achv(cur[k][0], cur[k][1]); });
    return { p, cur, mtd, ach, wk, sum: (ach.obs + ach.ins + ach.haz) / 3, wkSum: (wk.obs + wk.ins + wk.haz) / 3, cuti: cur.st === 'Cuti', weeks }; };
  const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  function compute(w) {
    const rows = people.filter(p => inRange(p, w)).sort((a, b) => DEPTS.indexOf(a.dept) - DEPTS.indexOf(b.dept) || (+a.urut || 99) - (+b.urut || 99)).map(p => row(p, w));
    const depts = DEPTS.map(d => { const rs = rows.filter(r => r.p.dept === d); const on = rs.filter(r => !r.cuti); const f = g => avg(on.map(g));
      const levels = LV.filter(l => rs.some(r => lv(r.p) === l)).map(l => { const o = on.filter(r => lv(r.p) === l); return { k: l, n: rs.filter(r => lv(r.p) === l).length, on: o.length,
        P: Object.fromEntries(K.map(c => [c, o.length ? (o.some(r => r.cur[c][0] > 0) ? 1 : null) : null])), A: Object.fromEntries(K.map(c => [c, avg(o.map(r => r.wk[c]))])) }; });
      const tot = { P: {}, A: {} }; K.forEach(c => { tot.A[c] = avg(levels.map(l => l.A[c]).filter(v => v != null)); tot.P[c] = avg(levels.map(l => l.P[c]).filter(v => v != null)); });
      return { d, sec: SEC[d], rows: rs, on: on.length, cuti: rs.length - on.length, obs: f(r => r.ach.obs), ins: f(r => r.ach.ins), haz: f(r => r.ach.haz), sum: f(r => r.sum), wk: f(r => r.wkSum), levels, tot }; }).filter(x => x.rows.length);
    const wo = depts.filter(x => x.on); const sv = g => avg(wo.map(g));
    return { ws: w, label: 'W' + wno(w), end: uIso(uDate(w) + 6 * DAY), month: month(w), rows, depts, site: { sum: sv(x => x.sum), obs: sv(x => x.obs), ins: sv(x => x.ins), haz: sv(x => x.haz), wk: sv(x => x.wk), on: rows.filter(r => !r.cuti).length, cuti: rows.filter(r => r.cuti).length } };
  }
  return { ws, add, month, wno, compute, lv, now: () => ws(uIso(Date.now() + 7 * 3600e3)) };
}
module.exports = { make, TYPE, SEC, levelOf };
