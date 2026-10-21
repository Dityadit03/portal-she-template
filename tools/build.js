/* Membangun portal dari template + portal.config.json + Environment Variables Vercel.
   Dijalankan otomatis oleh Vercel setiap deploy (Build Command: node tools/build.js).
   Hasil: folder public/ (index.html + js/). Tidak perlu diinstal apa pun. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');

function stop(msg) {
  console.error('\n[GAGAL] ' + msg + '\n');
  process.exit(1);
}

let cfg;
try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'portal.config.json'), 'utf8')); }
catch (e) { stop('portal.config.json tidak bisa dibaca. Pastikan format JSON benar (tanda kutip, koma). Detail: ' + e.message); }

const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = (env.SUPABASE_ANON_KEY || '').trim();
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)) stop('Environment Variable SUPABASE_URL belum diisi atau salah (contoh: https://abcdefgh.supabase.co).');
if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(SUPABASE_ANON_KEY)) stop('Environment Variable SUPABASE_ANON_KEY harus kunci "anon public" yang diawali eyJ (Supabase > Project Settings > API Keys > Legacy API Keys).');

/* teks konfigurasi dibersihkan agar aman ditaruh di HTML maupun JavaScript */
const clean = v => String(v == null ? '' : v).replace(/[<>`"'\\{}$]/g, '').replace(/\s+/g, ' ').trim();
const p = cfg.perusahaan || {}, s = cfg.site || {};
const T = {
  NAMA_PERUSAHAAN: clean(p.nama),
  SINGKATAN: clean(p.singkatan),
  NAMA_SITE: clean(s.nama),
  SINGKAT_SITE: clean(s.singkatan),
  FOOTER: clean(cfg.footer || ('© Tim SHE ' + (p.singkatan || '') + ' · Site ' + (s.singkatan || '')))
};
T.NAMA_PERUSAHAAN_KAPITAL = T.NAMA_PERUSAHAAN.toUpperCase();
for (const k of ['NAMA_PERUSAHAAN', 'SINGKATAN', 'NAMA_SITE', 'SINGKAT_SITE']) if (!T[k]) stop('portal.config.json: isian "' + k.toLowerCase() + '" masih kosong.');

/* logo -> data URI */
const logoFile = path.join(ROOT, cfg.logo || 'branding/logo.svg');
if (!fs.existsSync(logoFile)) stop('File logo tidak ditemukan: ' + (cfg.logo || 'branding/logo.svg'));
const ext = path.extname(logoFile).toLowerCase();
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext];
if (!mime) stop('Format logo harus PNG, JPG, SVG atau WEBP.');
const logoBuf = fs.readFileSync(logoFile);
if (logoBuf.length > 400 * 1024) stop('Ukuran logo maksimal 400 KB (sekarang ' + Math.round(logoBuf.length / 1024) + ' KB). Perkecil dulu.');
T.LOGO_SRC = 'data:' + mime + ';base64,' + logoBuf.toString('base64');

/* folder Drive */
const drive = cfg.drive || {};
const WAJIB = ['root', 'ekspor', 'p2h', 'ftw', 'obs', 'insp', 'hazard', 'insiden', 'induksi', 'izin', 'wo', 'sap', 'foto', 'sert', 'tna', 'trn', 'pelanggaran', 'sp', 'ks', 'bukti', 'sapdb', 'rawdb'];
const kosong = WAJIB.filter(k => !/^[A-Za-z0-9_-]{20,}$/.test(drive[k] || ''));
if (kosong.length) console.warn('[PERINGATAN] Folder Drive belum lengkap di portal.config.json: ' + kosong.join(', ') + '. Portal tetap jalan, tapi upload ke Drive belum aktif. Jalankan setup() di Apps Script lalu salin blok "drive".');

/* SAP: minggu acuan */
const sap = cfg.sap || {};
if (sap.start && !/^\d{4}-\d{2}-\d{2}$/.test(sap.start)) stop('portal.config.json: sap.start harus berformat YYYY-MM-DD.');

/* tulis hasil */
let html = fs.readFileSync(path.join(ROOT, 'src/portal.template.html'), 'utf8');
for (const [k, v] of Object.entries(T)) html = html.split('{{' + k + '}}').join(v);
const sisa = html.match(/\{\{[A-Z_]+\}\}/g);
if (sisa) stop('Token belum terisi: ' + [...new Set(sisa)].join(', '));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.copyFileSync(path.join(ROOT, 'js/sb-adapter.js'), path.join(OUT, 'js/sb-adapter.js'));
const pub = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_ANON_KEY,
  drive,
  sap: sap.start ? { start: sap.start, week: Number(sap.week) || 1 } : undefined,
  laporanBulanan: cfg.laporanBulanan || undefined
};
fs.writeFileSync(path.join(OUT, 'js/config.js'), '/* dibuat otomatis oleh tools/build.js — jangan diedit */\nwindow.SHE_CONFIG=' + JSON.stringify(pub) + ';\n');
console.log('[OK] Portal dibangun untuk ' + T.NAMA_PERUSAHAAN + ' (' + T.SINGKATAN + ') · Site ' + T.SINGKAT_SITE + ' · ' + Math.round(html.length / 1024) + ' KB');
