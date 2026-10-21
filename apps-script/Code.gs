/**
 * Portal SHE · penerima upload ke Google Drive + sinkron Google Sheets (SAP & Raw Data)
 *
 * CARA PASANG (ringkas, lengkapnya di Modul Instalasi):
 *  1. Isi PENGATURAN di bawah (singkatan perusahaan).
 *  2. Klik "+" di samping Layanan > pilih "Drive API" > Tambahkan.
 *  3. Pilih fungsi setup di toolbar > Jalankan > izinkan akses.
 *     setup() membuat semua folder, Log Upload, Database SAP, Database Raw Data dan kata rahasia (SECRET).
 *     Hasilnya muncul di "Log eksekusi": salin blok "drive" ke portal.config.json dan SECRET ke Vercel (GAS_SECRET).
 *  4. Terapkan > Deployment baru > Aplikasi web · Jalankan sebagai: Saya · Akses: Siapa saja.
 *     Salin URL /exec ke Vercel (GAS_UPLOAD_URL).
 *
 * Susunan arsip otomatis: <Folder kategori>/<Tahun>/<MM - Bulan>/<YYYY-MM-DD>_<KODE>_<nama>.<ext>
 */
var PENGATURAN = {
  NAMA_SINGKAT: 'ABC',   // singkatan perusahaan, sama dengan portal.config.json (mis. 'ABC')
  ALAMAT_PORTAL: ''      // isi setelah portal online, mis. 'https://she-abc.vercel.app'
};
var PROPS = PropertiesService.getScriptProperties();
var BRAND = 'Portal SHE ' + PENGATURAN.NAMA_SINGKAT;
var ROOT_ID = PROPS.getProperty('ROOT_ID') || '';
var FOLDERS = JSON.parse(PROPS.getProperty('FOLDERS_JSON') || '{}');
var BULAN = ['01 - Januari', '02 - Februari', '03 - Maret', '04 - April', '05 - Mei', '06 - Juni', '07 - Juli', '08 - Agustus', '09 - September', '10 - Oktober', '11 - November', '12 - Desember'];

function doPost(e) {
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    var b = JSON.parse(e.postData.contents);
    if (!secret || b.secret !== secret) return out({ error: 'forbidden' });
    if (b.action === 'sap') return out(sapSync(b));
    if (b.action === 'raw') return out(rawSync(b));
    var cfg = FOLDERS[b.parentId];
    if (!cfg) return out({ error: 'folder tidak diizinkan' });
    var now = new Date();
    var tz = 'Asia/Jakarta';
    var ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    var target = targetFolder(b.parentId, cfg.mode, now, tz);
    var name = cleanName(b.title, ymd, cfg.kode);
    var bytes = Utilities.base64Decode(b.data);
    var blob = Utilities.newBlob(bytes, b.mimeType || 'application/octet-stream', name);
    var file;
    var isSheet = /spreadsheetml|ms-excel|text\/csv/.test(b.mimeType || '');
    if (b.convert && isSheet) {
      var res = Drive.Files.create({ name: name.replace(/\.(xlsx|xls|csv)$/i, ''), mimeType: 'application/vnd.google-apps.spreadsheet', parents: [target.getId()] }, blob);
      file = DriveApp.getFileById(res.id);
    } else {
      blob.setName(uniqueName(target, name));
      file = target.createFile(blob);
    }
    file.setDescription(BRAND + ' · ' + cfg.kat + ' · diunggah oleh ' + (b.by || '-') + ' · ' + Utilities.formatDate(now, tz, 'dd MMM yyyy HH:mm'));
    var path = folderPath(target);
    logRow([Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss'), cfg.kat, file.getName(), path, file.getUrl(), b.by || '', Math.round(bytes.length / 1024), b.mimeType || '', b.ref || '']);
    return out({ id: file.getId(), url: file.getUrl(), name: file.getName(), path: path, kategori: cfg.kat, folderUrl: target.getUrl(), kb: Math.round(bytes.length / 1024) });
  } catch (err) {
    return out({ error: String(err && err.message || err).slice(0, 300) });
  }
}

function targetFolder(parentId, mode, now, tz) {
  var f = DriveApp.getFolderById(parentId);
  if (mode === 'flat') return f;
  f = child(f, Utilities.formatDate(now, tz, 'yyyy'));
  if (mode === 'ym') f = child(f, BULAN[+Utilities.formatDate(now, tz, 'M') - 1]);
  return f;
}
function child(parent, name) {
  var key = 'f:' + parent.getId() + ':' + name;
  var cache = CacheService.getScriptCache();
  var id = cache.get(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var it = parent.getFoldersByName(name);
    var f = it.hasNext() ? it.next() : parent.createFolder(name);
    cache.put(key, f.getId(), 21600);
    return f;
  } finally { lock.releaseLock(); }
}
function cleanName(title, ymd, kode) {
  var t = String(title || 'file').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim();
  var m = t.match(/^(.*?)(\.[A-Za-z0-9]{2,5})$/);
  var base = m ? m[1] : t, ext = m ? m[2].toLowerCase() : '';
  base = base.replace(/\s/g, '_').replace(/_+/g, '_').slice(0, 140);
  if (!/^\d{4}-\d{2}-\d{2}/.test(base)) base = ymd + '_' + kode + '_' + base;
  else base = base.slice(0, 10) + '_' + kode + base.slice(10);
  return base + ext;
}
function uniqueName(folder, name) {
  if (!folder.getFilesByName(name).hasNext()) return name;
  var m = name.match(/^(.*?)(\.[^.]+)?$/), base = m[1], ext = m[2] || '';
  for (var i = 2; i < 100; i++) { var n = base + '_v' + i + ext; if (!folder.getFilesByName(n).hasNext()) return n; }
  return base + '_' + Date.now() + ext;
}
function folderPath(f) {
  var parts = [], cur = f;
  for (var i = 0; i < 6 && cur; i++) {
    parts.unshift(cur.getName());
    if (cur.getId() === ROOT_ID) break;
    var ps = cur.getParents(); cur = ps.hasNext() ? ps.next() : null;
  }
  return parts.join(' / ');
}
function logSheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LOG_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) {} }
  var ss = SpreadsheetApp.create('Log Upload ' + BRAND);
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(ROOT_ID));
  var sh = ss.getSheets()[0]; sh.setName('Log');
  sh.appendRow(['Waktu (WIB)', 'Kategori', 'Nama file', 'Lokasi folder', 'Link file', 'Diunggah oleh', 'Ukuran (KB)', 'Tipe file', 'Referensi']);
  sh.setFrozenRows(1); sh.getRange('A1:I1').setFontWeight('bold').setBackground('#2E1A6E').setFontColor('#FFFFFF');
  props.setProperty('LOG_ID', ss.getId());
  return sh;
}
function logRow(row) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { logSheet().appendRow(row); } finally { lock.releaseLock(); }
}
function tesSetup() {
  var sh = logSheet();
  Object.keys(FOLDERS).forEach(function (id) { DriveApp.getFolderById(id).getName(); });
  Logger.log('OK. Log: ' + sh.getParent().getUrl());
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ================= Database SAP (Google Sheet, diperbarui otomatis dari portal) ================= */
var SAP_FOLDER = PROPS.getProperty('SAP_FOLDER') || '';
var SAP_SHEETS = {
  'Ringkasan Mingguan': { head: ['Mulai minggu', 'Minggu', 'Selesai', 'Bulan MTD', 'SAP site MTD', 'Observasi MTD', 'Inspeksi MTD', 'Hazard MTD', 'Capaian minggu', 'Onsite', 'Cuti', 'PJO', 'HSE', 'PRO', 'PLANT', 'LOG', 'HRGA', 'ENG', 'Diperbarui'], pct: [5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18], widths: [100, 70, 90, 80] },
  'Rekap per Orang': { head: ['Kunci', 'Minggu', 'Mulai minggu', 'Selesai', 'Section', 'Level', 'Nama', 'NIK', 'Jabatan', 'Status', 'OBS Plan', 'OBS Act', 'OBS %', 'INS Plan', 'INS Act', 'INS %', 'HAZ Plan', 'HAZ Act', 'HAZ %', 'Capaian minggu', 'MTD OBS %', 'MTD INS %', 'MTD HAZ %', 'Summary MTD', 'Sumber'], pct: [13, 16, 19, 20, 21, 22, 23, 24], hide: 1, widths: [10, 60, 95, 90, 70, 55, 190, 90, 150] },
  'Laporan Formulir': { head: ['ID', 'Minggu', 'Mulai minggu', 'Tanggal', 'Jenis', 'Nama', 'NIK', 'Departemen', 'Lokasi', 'Keterangan', 'Hasil / status', 'Link file', 'Dihitung untuk peserta SAP', 'Diperbarui (UTC)'], hide: 1, widths: [10, 60, 95, 90, 120, 180, 90, 100, 130, 320, 160, 220, 190, 150] },
  'Peserta SAP': { head: ['ID', 'Nama', 'NIK', 'Kelompok', 'Section', 'Level', 'Jabatan', 'Target OBS', 'Target INS', 'Target HAZ', 'Status', 'Masuk sejak', 'Keluar sejak', 'Perubahan terakhir'], hide: 1, widths: [10, 190, 90, 130, 70, 55, 170] }
};
function sapBook() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SAP_DB_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Database SAP ' + BRAND);
    ss.setSpreadsheetLocale('en_US');
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(SAP_FOLDER));
    props.setProperty('SAP_DB_ID', ss.getId());
    ss.getSheets()[0].setName('Performance');
  }
  ['Performance', 'Ringkasan Mingguan', 'Rekap per Orang', 'Laporan Formulir', 'Peserta SAP'].forEach(function (n, i) {
    var sh = ss.getSheetByName(n);
    if (!sh) { sh = ss.insertSheet(n, i); }
    var c = SAP_SHEETS[n];
    if (c && sh.getRange(1, 1).getValue() !== c.head[0]) {
      sh.getRange(1, 1, 1, c.head.length).setValues([c.head]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E').setWrap(true).setVerticalAlignment('middle');
      sh.setFrozenRows(1); sh.setRowHeight(1, 36);
      if (c.hide) sh.hideColumns(1);
      (c.widths || []).forEach(function (w, j) { sh.setColumnWidth(j + 1, w); });
      sapPctRules(sh, c);
    }
  });
  if (!ss.getSheetByName(PULL)) sapPullSheet(ss);
  return ss;
}
function sapPctRules(sh, c) {
  if (!c.pct) return;
  var rules = sh.getConditionalFormatRules();
  c.pct.forEach(function (col) {
    var r = sh.getRange(2, col, 2000, 1); r.setNumberFormat('0%');
    [[1, 9, '#E7F6EC', '#15803D'], [0.75, 0.9999, '#F0F7E3', '#4D7C0F'], [0.5, 0.7499, '#FEF7E0', '#A16207'], [0.25, 0.4999, '#FFF1E6', '#C2410C'], [0, 0.2499, '#FDECEC', '#B91C1C']].forEach(function (t) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(t[0], t[1]).setBackground(t[2]).setFontColor(t[3]).setBold(true).setRanges([r]).build());
    });
  });
  sh.setConditionalFormatRules(rules);
}
/* tulis ulang isi tabel: hapus baris dengan kunci yang diganti, tambah baris baru, urutkan */
function sapTable(sh, width, rows, dropFn, sortFn) {
  var last = sh.getLastRow(), cur = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  var keep = cur.filter(function (r) { return r[0] !== '' && !dropFn(r); });
  var all = keep.concat(rows);
  if (sortFn) all.sort(sortFn);
  if (last > 1) sh.getRange(2, 1, last - 1, width).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, width).setValues(all);
  return all.length;
}
function sapSync(b) {
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var ss = sapBook(), n = {};
    /* laporan formulir */
    if (b.raw && b.raw.length) {
      var ids = {}; b.raw.forEach(function (x) { ids[x.id] = 1; });
      var add = b.raw.filter(function (x) { return x.op === 'upsert'; }).map(function (x) { return x.row; });
      n.laporan = sapTable(ss.getSheetByName('Laporan Formulir'), 14, add, function (r) { return ids[r[0]]; }, function (a, c) { return String(c[3]).localeCompare(String(a[3])) || String(c[13]).localeCompare(String(a[13])); });
    }
    var wk = {}; (b.weeks || []).forEach(function (w) { wk[w] = 1; });
    var key = function (v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd') : String(v); };
    if (b.rekap) n.rekap = sapTable(ss.getSheetByName('Rekap per Orang'), 25, b.rekap, function (r) { return wk[key(r[2])]; }, function (a, c) { return key(c[2]).localeCompare(key(a[2])) || String(a[4]).localeCompare(String(c[4])); });
    if (b.ring) n.ringkasan = sapTable(ss.getSheetByName('Ringkasan Mingguan'), 19, b.ring, function (r) { return wk[key(r[0])]; }, function (a, c) { return key(c[0]).localeCompare(key(a[0])); });
    if (b.peserta) { var ps = ss.getSheetByName('Peserta SAP'); n.peserta = sapTable(ps, 14, b.peserta, function () { return true; }, function (a, c) { return String(a[10]).localeCompare(String(c[10])) || String(a[3]).localeCompare(String(c[3])); }); }
    if (b.perf) sapPerfSheet(ss.getSheetByName('Performance'), b.perf);
    return { ok: true, url: ss.getUrl(), n: n };
  } finally { lock.releaseLock(); }
}
function sapPerfSheet(sh, p) {
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); sh.clear(); sh.clearConditionalFormatRules(); sh.setHiddenGridlines(true);
  var K = ['OBS', 'INS', 'HAZ'], col = { OBS: ['#F3EEFF', '#6D28D9'], INS: ['#EAF1FF', '#1D4ED8'], HAZ: ['#FFF1E8', '#C2410C'] };
  sh.getRange(1, 1, 1, 21).merge().setValue('SAP PERFORMANCE (%) · ' + p.label.replace('W', 'W-')).setFontSize(15).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E');
  sh.getRange(2, 1, 1, 21).merge().setValue(p.ws + ' s.d. ' + p.end + ' · diperbarui otomatis ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm') + ' WIB · P = plan, A = aktual · N/A = semua peserta di level itu cuti').setFontColor('#4B22A8').setBackground('#EFEAFB').setFontSize(9);
  sh.setRowHeight(1, 34);
  var pctCells = [];
  sh.getRange(4, 2, 1, 4).merge().setValue('SAP Performance (%) - ' + p.label).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E').setHorizontalAlignment('center');
  sh.getRange(5, 2, 1, 4).setValues([['Section'].concat(K)]).setFontWeight('bold').setHorizontalAlignment('center');
  K.forEach(function (k, j) { sh.getRange(5, 3 + j).setBackground(col[k][0]).setFontColor(col[k][1]); });
  p.sec.forEach(function (s, i) { sh.getRange(6 + i, 2, 1, 4).setValues([[s.sec].concat(s.A)]).setHorizontalAlignment('center'); pctCells.push(sh.getRange(6 + i, 3, 1, 3)); });
  sh.getRange(5, 2, p.sec.length + 1, 4).setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
  var boxes = p.sec.filter(function (s) { return s.sec !== 'PJO'; }), top = 4, nextTop = 4;
  boxes.forEach(function (s, i) {
    var c0 = i % 2 ? 15 : 7; if (i % 2 === 0) { top = nextTop; }
    sh.getRange(top, c0, 2, 1).merge().setValue(s.sec).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E').setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(top, c0 + 1, 1, 6).merge().setValue(p.label.replace('W', 'W-')).setFontWeight('bold').setBackground('#F3F4F6').setHorizontalAlignment('center');
    K.forEach(function (k, j) { sh.getRange(top + 1, c0 + 1 + j * 2, 1, 2).merge().setValue(k).setFontWeight('bold').setBackground(col[k][0]).setFontColor(col[k][1]).setHorizontalAlignment('center');
      sh.getRange(top + 2, c0 + 1 + j * 2, 1, 2).setValues([['P', 'A']]).setFontColor('#9CA3AF').setFontWeight('bold').setHorizontalAlignment('center'); });
    var rows = s.levels.map(function (l) { return [l.k + '  (' + l.on + '/' + l.n + ')', l.P[0], l.A[0], l.P[1], l.A[1], l.P[2], l.A[2]]; });
    rows.push(['Total', s.tot.P[0], s.A[0], s.tot.P[1], s.A[1], s.tot.P[2], s.A[2]]);
    sh.getRange(top + 3, c0, rows.length, 7).setValues(rows).setHorizontalAlignment('center');
    sh.getRange(top + 3, c0, rows.length, 1).setFontWeight('bold').setHorizontalAlignment('left');
    sh.getRange(top + 2 + rows.length, c0, 1, 7).setBackground('#F3F4F6').setFontWeight('bold');
    sh.getRange(top, c0, rows.length + 3, 7).setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
    pctCells.push(sh.getRange(top + 3, c0 + 1, rows.length, 6));
    nextTop = Math.max(nextTop, top + rows.length + 5);
  });
  var rules = [];
  pctCells.forEach(function (r) { r.setNumberFormat('0%');
    [[1, 9, '#E7F6EC', '#15803D'], [0.75, 0.9999, '#F0F7E3', '#4D7C0F'], [0.5, 0.7499, '#FEF7E0', '#A16207'], [0.25, 0.4999, '#FFF1E6', '#C2410C'], [0, 0.2499, '#FDECEC', '#B91C1C']].forEach(function (t) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(t[0], t[1]).setBackground(t[2]).setFontColor(t[3]).setBold(true).setRanges([r]).build()); });
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('N/A').setBackground('#F3F4F6').setFontColor('#9CA3AF').setRanges([r]).build()); });
  sh.setConditionalFormatRules(rules);
  sh.setColumnWidth(1, 12); sh.setColumnWidth(2, 80); [3, 4, 5].forEach(function (c) { sh.setColumnWidth(c, 60); }); sh.setColumnWidth(6, 16); sh.setColumnWidth(7, 90); sh.setColumnWidth(14, 16); sh.setColumnWidth(15, 90);
  [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21].forEach(function (c) { sh.setColumnWidth(c, 52); });
}
function tesSap() { Logger.log(JSON.stringify(sapSync({ weeks: [], rekap: [], ring: [], peserta: [] }))); }

/* ---------- Tab "Tarik Data Mingguan": pilih minggu di B4, semua tabel menyesuaikan ---------- */
var PULL = 'Tarik Data Mingguan';
function sapPullSheet(ss) {
  ss.setSpreadsheetLocale('en_US');
  var sh = ss.getSheetByName(PULL);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(PULL, 0);
  sh.setHiddenGridlines(true);
  var H = function (r, n) { return sh.getRange(r, 1, 1, n).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E').setWrap(true).setVerticalAlignment('middle'); };
  var D = function (f) { return 'TEXT(' + f + ',"yyyy-mm-dd")'; };
  sh.getRange('A1:L1').merge().setValue('TARIK DATA SAP MINGGUAN · ' + BRAND.toUpperCase()).setFontSize(15).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E');
  sh.getRange('A2:L2').merge().setValue('Pilih minggu di sel kuning (B4). Semua tabel di bawah otomatis menampilkan data minggu itu. Untuk menyimpan: File › Download › Microsoft Excel / PDF, atau salin tabelnya. Data diperbarui otomatis dari ' + BRAND + '.')
    .setFontColor('#4B22A8').setBackground('#EFEAFB').setFontSize(9).setWrap(true);
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 32);
  sh.getRange('A4').setValue('Pilih minggu').setFontWeight('bold');
  sh.getRange('B4:F4').merge().setBackground('#FEF3C7').setFontWeight('bold').setFontSize(12).setBorder(true, true, true, true, false, false, '#F59E0B', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('A5').setValue('Periode').setFontWeight('bold');
  sh.getRange('AA1').setValue('daftar minggu');
  sh.getRange('AA2').setFormula('=ARRAYFORMULA(IF(\'Ringkasan Mingguan\'!B2:B="","",\'Ringkasan Mingguan\'!B2:B&"  ·  "&TEXT(\'Ringkasan Mingguan\'!A2:A,"dd mmm")&" – "&TEXT(\'Ringkasan Mingguan\'!C2:C,"dd mmm yyyy")))');
  sh.getRange('Z1').setValue('mulai');
  sh.getRange('Z2').setFormula('=IFERROR(INDEX(\'Ringkasan Mingguan\'!A2:A,MATCH($B$4,$AA$2:$AA,0)),"")');
  sh.getRange('Z3').setFormula('=IFERROR(INDEX(\'Ringkasan Mingguan\'!C2:C,MATCH($B$4,$AA$2:$AA,0)),"")');
  sh.getRange('B5:F5').merge().setFormula('=IF($Z$2="","",TEXT($Z$2,"dd mmm yyyy")&" s.d. "&TEXT($Z$3,"dd mmm yyyy"))');
  sh.getRange('B4').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange('AA2:AA300'), true).setAllowInvalid(false).build());
  SpreadsheetApp.flush();
  var first = sh.getRange('AA2').getDisplayValue(); if (first) sh.getRange('B4').setValue(first);
  /* 1. ringkasan */
  sh.getRange('A7').setValue('1. Ringkasan site & section').setFontWeight('bold').setFontColor('#2E1A6E').setFontSize(11);
  sh.getRange('A8').setFormula("=ARRAYFORMULA('Ringkasan Mingguan'!A1:S1)"); H(8, 19); sh.setRowHeight(8, 32);
  sh.getRange('A9').setFormula('=IFERROR(FILTER(\'Ringkasan Mingguan\'!A2:S,' + D("'Ringkasan Mingguan'!A2:A") + '=' + D('$Z$2') + '),"Pilih minggu di sel B4")');
  [5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18].forEach(function (c) { sh.getRange(9, c).setNumberFormat('0%'); });
  sh.getRange(9, 1).setNumberFormat('dd mmm yyyy'); sh.getRange(9, 3).setNumberFormat('dd mmm yyyy'); sh.getRange(9, 4).setNumberFormat('mmm yyyy');
  /* 2. rekap per orang (maks. 60 peserta) */
  sh.getRange('A11').setValue('2. Rekap per orang (Plan, Act, % minggu ini & MTD)').setFontWeight('bold').setFontColor('#2E1A6E').setFontSize(11);
  sh.getRange('A12').setFormula("=ARRAYFORMULA('Rekap per Orang'!B1:Y1)"); H(12, 24); sh.setRowHeight(12, 32);
  sh.getRange('A13').setFormula('=IFERROR(SORT(FILTER(\'Rekap per Orang\'!B2:Y,' + D("'Rekap per Orang'!C2:C") + '=' + D('$Z$2') + '),4,TRUE,6,TRUE),"Belum ada data untuk minggu ini")');
  [12, 15, 18, 19, 20, 21, 22, 23].forEach(function (c) { sh.getRange(13, c, 60, 1).setNumberFormat('0%'); });
  sh.getRange(13, 2, 60, 2).setNumberFormat('dd mmm yyyy');
  /* 3. laporan formulir */
  sh.getRange('A75').setValue('3. Laporan formulir minggu ini (Observasi, Inspeksi, Hazard)').setFontWeight('bold').setFontColor('#2E1A6E').setFontSize(11);
  sh.getRange('A76').setFormula("=ARRAYFORMULA('Laporan Formulir'!B1:N1)"); H(76, 13); sh.setRowHeight(76, 32);
  sh.getRange('A77').setFormula('=IFERROR(SORT(FILTER(\'Laporan Formulir\'!B2:N,' + D("'Laporan Formulir'!C2:C") + '=' + D('$Z$2') + '),3,TRUE),"Belum ada laporan formulir minggu ini")');
  sh.getRange(77, 2, 900, 2).setNumberFormat('dd mmm yyyy');
  var rules = [], pr = [sh.getRange(9, 5, 1, 5), sh.getRange(9, 12, 1, 7), sh.getRange(13, 12, 60, 1), sh.getRange(13, 15, 60, 1), sh.getRange(13, 18, 60, 6)];
  pr.forEach(function (r) {
    [[1, 9, '#E7F6EC', '#15803D'], [0.75, 0.9999, '#F0F7E3', '#4D7C0F'], [0.5, 0.7499, '#FEF7E0', '#A16207'], [0.25, 0.4999, '#FFF1E6', '#C2410C'], [0, 0.2499, '#FDECEC', '#B91C1C']].forEach(function (t) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(t[0], t[1]).setBackground(t[2]).setFontColor(t[3]).setBold(true).setRanges([r]).build()); });
  });
  sh.setConditionalFormatRules(rules);
  sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 95); sh.setColumnWidth(3, 95); [4, 5].forEach(function (c) { sh.setColumnWidth(c, 80); });
  sh.setColumnWidth(6, 190); sh.setColumnWidth(7, 95); sh.setColumnWidth(8, 150); for (var c = 9; c <= 24; c++) sh.setColumnWidth(c, 70);
  sh.hideColumns(26, 2);
  sh.setFrozenRows(5);
  return sh;
}
function tesPull() { var ss = sapBook(); sapPullSheet(ss); Logger.log(ss.getUrl()); }

/* ================= Database Portal SHE (Raw Data): semua data aplikasi, satu tab per menu ================= */
var RAW_DB_ID = PROPS.getProperty('RAW_DB_ID') || '';
var RAW_TEXT = /(^ID$|NIK|No\.|ref|HP|Telp|ID peserta|ID P2H|ID file)/i;
function rawSync(b) {
  var lock = LockService.getScriptLock(); lock.waitLock(28000);
  try {
    var ss = SpreadsheetApp.openById(RAW_DB_ID), props = PropertiesService.getScriptProperties();
    var now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm') + ' WIB', n = {}, created = false;
    (b.tabs || []).forEach(function (t) {
      var sh = ss.getSheetByName(t.name);
      if (!sh) { sh = ss.insertSheet(t.name); created = true; }
      var f = sh.getFilter(); if (f) f.remove();
      sh.clear();
      var w = Math.max(1, t.header.length), rows = t.rows || [];
      if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
      if (sh.getMaxRows() < rows.length + 2) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 2 - sh.getMaxRows());
      t.header.forEach(function (h, j) { if (RAW_TEXT.test(h)) sh.getRange(2, j + 1, Math.max(rows.length, 1), 1).setNumberFormat('@'); });
      sh.getRange(1, 1, 1, w).setValues([t.header]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E').setWrap(true).setVerticalAlignment('middle');
      if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows.map(function (r) { while (r.length < w) r.push(''); return r.slice(0, w); }));
      sh.setFrozenRows(1); sh.setRowHeight(1, 34);
      sh.getRange(1, 1, Math.max(rows.length + 1, 2), w).createFilter();
      sh.getRange(1, 1).setNote('Menu aplikasi: ' + t.menu + '\nDiperbarui otomatis dari ' + BRAND + ': ' + now);
      sh.setColumnWidths(1, w, 150); if (t.header[0] === 'ID') sh.setColumnWidth(1, 90);
      props.setProperty('RAW_AT_' + t.name, now);
      n[t.name] = rows.length;
    });
    rawIndex(ss, b.index || [], props, created || b.full);
    return { ok: true, url: ss.getUrl(), n: n };
  } finally { lock.releaseLock(); }
}
function rawIndex(ss, index, props, reorder) {
  var sh = ss.getSheetByName('Daftar Isi'); if (!sh) sh = ss.insertSheet('Daftar Isi', 0);
  sh.getBandings().forEach(function (x) { x.remove(); }); sh.clear(); sh.setHiddenGridlines(true);
  sh.getRange('A1:F1').merge().setValue('DATABASE ' + BRAND.toUpperCase() + ' · RAW DATA').setFontSize(15).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E');
  sh.getRange('A2:F2').merge().setValue('Semua data aplikasi ' + BRAND + ', satu tab per menu. Diperbarui otomatis ±1 menit setelah ada data baru/berubah di aplikasi. Jangan mengedit data di sini (akan ditimpa); edit lewat aplikasi. Untuk menarik data: buka tab, pakai filter di baris judul, lalu File › Download.')
    .setFontColor('#4B22A8').setBackground('#EFEAFB').setFontSize(9).setWrap(true);
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 44);
  var sap = PropertiesService.getScriptProperties().getProperty('SAP_DB_ID');
  var links = [[BRAND + ' (aplikasi)', PENGATURAN.ALAMAT_PORTAL], ['Database SAP (tarik data per minggu)', sap ? 'https://docs.google.com/spreadsheets/d/' + sap + '/edit' : ''], ['Folder utama Google Drive', 'https://drive.google.com/drive/folders/' + ROOT_ID]];
  sh.getRange('A4').setValue('Akses cepat').setFontWeight('bold').setFontColor('#2E1A6E');
  var link = function (t, u) { return SpreadsheetApp.newRichTextValue().setText(t).setLinkUrl(u).build(); };
  links.forEach(function (l, i) { if (l[1]) sh.getRange(5 + i, 1, 1, 3).merge().setRichTextValue(link(l[0] + ' ↗', l[1])); });
  var top = 9;
  sh.getRange(top, 1, 1, 5).setValues([['No', 'Menu aplikasi', 'Tab data', 'Jumlah baris', 'Terakhir diperbarui']]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2E1A6E');
  var rows = [], f = [];
  index.forEach(function (t, i) {
    var s = ss.getSheetByName(t.name);
    rows.push([i + 1, t.menu, t.name, s ? Math.max(0, s.getLastRow() - 1) : 0, props.getProperty('RAW_AT_' + t.name) || '-']);
    f.push(s ? link(t.name, '#gid=' + s.getSheetId()) : SpreadsheetApp.newRichTextValue().setText(t.name).build());
  });
  if (rows.length) {
    sh.getRange(top + 1, 1, rows.length, 5).setValues(rows);
    sh.getRange(top + 1, 3, rows.length, 1).setRichTextValues(f.map(function (x) { return [x]; }));
    sh.getRange(top, 1, rows.length + 1, 5).setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(top + 1, 1, rows.length, 5).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }
  sh.setColumnWidth(1, 40); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 260); sh.setColumnWidth(4, 100); sh.setColumnWidth(5, 170);
  ['Sheet1', 'Sheet 1', 'Lembar1', 'Lembar 1'].forEach(function (nm) { var x = ss.getSheetByName(nm); if (x && ss.getSheets().length > 1 && x.getLastRow() === 0) ss.deleteSheet(x); });
  if (reorder) {
    ss.setActiveSheet(sh); ss.moveActiveSheet(1);
    index.forEach(function (t, i) { var s = ss.getSheetByName(t.name); if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 2); } });
    ss.setActiveSheet(sh);
  }
}

/* ================= setup(): jalankan SEKALI dari editor ================= */
var TREE = [
  // [kunci, nama folder, induk, kategori upload, kode file, mode subfolder]
  ['ekspor', '00 Database Portal (Raw Data & Ekspor)', 'root', 'Ekspor Database', 'EKSPOR', 'y'],
  ['harian', '01 Formulir Harian', 'root'],
  ['p2h', 'P2H Unit', 'harian', 'P2H Unit', 'P2H', 'ym'],
  ['ftw', 'Fit to Work', 'harian', 'Fit to Work', 'FTW', 'ym'],
  ['obs', 'Observasi (PTO)', 'harian', 'Observasi (PTO)', 'OBS', 'ym'],
  ['insp', 'Inspeksi', 'harian', 'Inspeksi', 'INSP', 'ym'],
  ['hazard', 'Hazard Report', 'harian', 'Hazard Report', 'HZD', 'ym'],
  ['insiden', 'Insiden & Nearmiss', 'harian', 'Insiden & Nearmiss', 'INS', 'ym'],
  ['induksi', 'Induksi', 'harian', 'Induksi', 'IND', 'ym'],
  ['izin', 'Izin Masuk Area', 'harian', 'Izin Masuk Area', 'IZN', 'ym'],
  ['wo', 'Perbaikan Unit (WO)', 'harian', 'Perbaikan Unit (WO)', 'WO', 'ym'],
  ['sap', '02 SAP Mingguan', 'root', 'Laporan SAP Mingguan', 'SAP', 'y'],
  ['pusat', '03 Pusat Data', 'root'],
  ['foto', 'Foto Karyawan', 'pusat', 'Foto Karyawan', 'FOTO', 'flat'],
  ['sert', 'Sertifikat Karyawan', 'pusat', 'Sertifikat Karyawan', 'SERT', 'y'],
  ['tna', 'TNA & Sertifikasi', 'pusat', 'TNA', 'TNA', 'y'],
  ['trn', 'Pelatihan', 'pusat', 'Pelatihan', 'TRN', 'ym'],
  ['pelanggaran', '04 Golden Rules & Pelanggaran', 'root', 'Pelanggaran', 'PLG', 'ym'],
  ['sp', 'Surat Peringatan (SP)', 'pelanggaran', 'Pelanggaran - SP', 'SP', 'ym'],
  ['ks', 'Konseling', 'pelanggaran', 'Pelanggaran - Konseling', 'KONS', 'ym'],
  ['bukti', 'Bukti', 'pelanggaran', 'Pelanggaran - Bukti', 'BUKTI', 'ym'],
  ['campaign', '05 Digital Campaign', 'root'],
  ['smkp', '06 Elemen SMKP', 'root'],
  ['env', '07 Environment - Pengelolaan Lingkungan', 'root']
];
function setup() {
  var ids = {}, folders = {};
  var root = null;
  if (ROOT_ID) { try { root = DriveApp.getFolderById(ROOT_ID); } catch (e) { root = null; } }
  if (!root) root = DriveApp.createFolder('SHE ' + PENGATURAN.NAMA_SINGKAT + ' - Portal');
  ROOT_ID = ids.root = root.getId(); PROPS.setProperty('ROOT_ID', ROOT_ID);
  TREE.forEach(function (t) {
    var f = child(DriveApp.getFolderById(ids[t[2]]), t[1]);
    ids[t[0]] = f.getId();
    if (t[3]) folders[f.getId()] = { kat: t[3], kode: t[4], mode: t[5] };
  });
  FOLDERS = folders; PROPS.setProperty('FOLDERS_JSON', JSON.stringify(folders));
  SAP_FOLDER = ids.sap; PROPS.setProperty('SAP_FOLDER', SAP_FOLDER);
  ids.log = logSheet().getParent().getId();
  ids.sapdb = sapBook().getId();
  if (RAW_DB_ID) { try { SpreadsheetApp.openById(RAW_DB_ID); } catch (e) { RAW_DB_ID = ''; } }
  if (!RAW_DB_ID) {
    var r = SpreadsheetApp.create('Database ' + BRAND + ' (Raw Data)');
    r.setSpreadsheetLocale('en_US');
    DriveApp.getFileById(r.getId()).moveTo(DriveApp.getFolderById(ids.ekspor));
    RAW_DB_ID = r.getId(); PROPS.setProperty('RAW_DB_ID', RAW_DB_ID);
  }
  ids.rawdb = RAW_DB_ID;
  if (!PROPS.getProperty('SECRET')) PROPS.setProperty('SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  Logger.log('SELESAI. Folder utama: https://drive.google.com/drive/folders/' + ids.root);
  Logger.log('1) Salin blok di bawah ini ke portal.config.json (ganti seluruh bagian "drive"):\n"drive": ' + JSON.stringify(ids, null, 2));
  Logger.log('2) GAS_SECRET untuk Vercel (rahasiakan):\n' + PROPS.getProperty('SECRET'));
  return ids;
}
