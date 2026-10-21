/* Spesifikasi tab "Database Portal SHE (Raw Data)".
   Urutan tab = urutan menu di aplikasi. Kolom yang tidak tercantum di sini tetap ikut (ditambahkan di belakang),
   jadi field baru di aplikasi otomatis muncul di spreadsheet. */
const F = (k, l) => [k, l];
const BASE_END = [F('fileUrl', 'Link file / foto'), F('created', 'Dibuat'), F('updated', 'Diperbarui')];
const DAILY = {
  p2h: ['P2H Unit', [F('tanggal', 'Tanggal'), F('shift', 'Shift'), F('nama', 'Driver / operator'), F('nik', 'NIK'), F('dept', 'Departemen'), F('unit', 'No. lambung unit'), F('jenisUnit', 'Jenis unit'), F('hm', 'HM / KM'), F('cek', 'Checklist'), F('temuan', 'Temuan / catatan'), F('kelayakan', 'Kesimpulan')]],
  ftw: ['Fit to Work', [F('tanggal', 'Tanggal'), F('shift', 'Shift'), F('nama', 'Nama'), F('nik', 'NIK'), F('dept', 'Departemen'), F('jamTidur', 'Jam tidur 24 jam'), F('obat', 'Minum obat penyebab kantuk'), F('keluhan', 'Keluhan kesehatan'), F('tensi', 'Tekanan darah'), F('kesimpulan', 'Kesimpulan'), F('catatan', 'Catatan pemeriksa')]],
  observasi: ['Observasi (PTO)', [F('tanggal', 'Tanggal'), F('nama', 'Observer (pengawas)'), F('nik', 'NIK'), F('dept', 'Departemen'), F('lokasi', 'Lokasi'), F('pekerjaan', 'Pekerjaan / aktivitas'), F('pekerja', 'Pekerja diobservasi'), F('jumlah', 'Jumlah pekerja'), F('hasil', 'Hasil'), F('temuan', 'Perilaku tidak aman / catatan'), F('tindakan', 'Coaching / tindakan'), F('status', 'Status')]],
  inspeksi: ['Inspeksi', [F('tanggal', 'Tanggal'), F('nama', 'Inspektor'), F('nik', 'NIK'), F('dept', 'Departemen'), F('jenisIns', 'Jenis inspeksi'), F('lokasi', 'Lokasi'), F('objek', 'Objek / unit'), F('hasil', 'Hasil'), F('temuan', 'Temuan'), F('tindakan', 'Tindak lanjut'), F('pic', 'Departemen PIC'), F('due', 'Due date'), F('status', 'Status')]],
  hazard: ['Hazard Report', [F('tanggal', 'Tanggal'), F('nama', 'Pelapor'), F('nik', 'NIK'), F('dept', 'Departemen pelapor'), F('lokasi', 'Lokasi'), F('jenis', 'Jenis (KTA/TTA)'), F('deskripsi', 'Temuan'), F('rekomendasi', 'Rekomendasi perbaikan'), F('pic', 'Departemen PIC'), F('due', 'Due date'), F('status', 'Status')]],
  insiden: ['Insiden & Nearmiss', [F('tanggal', 'Tanggal kejadian'), F('jam', 'Jam'), F('klasifikasi', 'Klasifikasi'), F('lokasi', 'Lokasi'), F('unit', 'Unit terlibat'), F('nama', 'Karyawan terlibat'), F('nik', 'NIK'), F('dept', 'Departemen'), F('pelapor', 'Pelapor'), F('kronologi', 'Kronologi'), F('tindakan', 'Tindakan segera')]],
  induksi: ['Induksi', [F('tanggal', 'Tanggal'), F('jenisInduksi', 'Jenis'), F('nama', 'Nama peserta'), F('nik', 'NIK'), F('jabatan', 'Jabatan'), F('dept', 'Departemen'), F('pemateri', 'Pemateri'), F('nilai', 'Nilai post test'), F('hasil', 'Hasil')]],
  izin: ['Izin Masuk Area', [F('tanggal', 'Tanggal pengajuan'), F('nama', 'Nama pemohon'), F('perusahaan', 'Perusahaan'), F('area', 'Area tujuan'), F('tujuan', 'Keperluan'), F('mulai', 'Berlaku mulai'), F('selesai', 'Berlaku s.d.'), F('jumlah', 'Jumlah orang'), F('pendamping', 'Pendamping'), F('status', 'Status')]]
};
const MON = {
  mcu: ['MCU', 'Tanggal MCU berikutnya / expired'], spip: ['SPIP (Commissioning & SKO)', 'Masa berlaku'], minep: ['Mine Permit', 'Masa berlaku'],
  kimper: ['KIMPER', 'Masa berlaku'], pica: ['PICA', 'Due date']
};
const TABS = [];
Object.keys(DAILY).forEach(t => TABS.push({ name: 'FH - ' + DAILY[t][0], menu: 'Formulir Harian', col: 'daily', where: d => d.type === t, cols: DAILY[t][1].concat(BASE_END), sort: 'tanggal', skip: ['type'] }));
TABS.push({ name: 'FH - Perbaikan Unit (WO)', menu: 'Formulir Harian', col: 'repairs', sort: 'tanggal',
  cols: [F('wo', 'No. WO'), F('tanggal', 'Tanggal'), F('unit', 'Unit'), F('jenisUnit', 'Jenis unit'), F('pelapor', 'Pelapor'), F('nik', 'NIK'), F('shift', 'Shift'), F('hm', 'HM'), F('items', 'Item tidak OK'), F('temuan', 'Temuan'), F('kelayakan', 'Kesimpulan P2H'), F('prioritas', 'Prioritas'), F('unitStatus', 'Status unit'), F('target', 'Target selesai'), F('status', 'Status WO'), F('pic', 'PIC'), F('mekanik', 'Mekanik'), F('tindakan', 'Tindakan perbaikan'), F('part', 'Part'), F('fotoUrl', 'Foto temuan'), F('fotoSesudah', 'Foto sesudah'), F('verifikator', 'Verifikator'), F('tglVerif', 'Tgl verifikasi'), F('catatanVerif', 'Catatan verifikasi'), F('p2hId', 'ID P2H'), F('created', 'Dibuat'), F('updated', 'Diperbarui')] });
TABS.push({ name: 'SAP - Peserta & Target', menu: 'SAP Mingguan', col: 'sap_people', sort: 'urut', asc: true,
  cols: [F('nama', 'Nama'), F('nik', 'NIK'), F('jabatan', 'Jabatan'), F('dept', 'Departemen'), F('level', 'Level'), F('target', 'Target'), F('aktif', 'Aktif'), F('mulai', 'Masuk SAP sejak'), F('selesai', 'Keluar SAP sejak'), F('alias', 'Nama lain'), F('riwayat', 'Riwayat'), F('urut', 'Urutan'), F('updated', 'Diperbarui')] });
TABS.push({ name: 'SAP - Arsip per Minggu', menu: 'SAP Mingguan', col: 'sap_rec', sort: 'ws',
  cols: [F('ws', 'Mulai minggu'), F('nama', 'Nama'), F('pid', 'ID peserta'), F('status', 'Status'), F('obs', 'Observasi [plan, act]'), F('ins', 'Inspeksi [plan, act]'), F('haz', 'Hazard [plan, act]'), F('src', 'Sumber')] });
TABS.push({ name: 'PD - Karyawan', menu: 'Pusat Data · Database Karyawan', col: 'employees', sort: 'nama', asc: true, flat: ['permit'],
  cols: [F('nama', 'Nama'), F('nik', 'NIK'), F('nikHR', 'NIK HR'), F('nikBDA', 'NIK ' + ((require('../portal.config.json').site || {}).singkatan || 'Site')), F('jabatan', 'Jabatan'), F('kelompok', 'Kelompok jabatan'), F('dept', 'Departemen'), F('section', 'Section'), F('status', 'Status'), F('statusKaryawan', 'Status karyawan'), F('statusPegawai', 'Status pegawai'), F('perusahaan', 'Perusahaan'), F('tglMasuk', 'Tanggal masuk'), F('onSite', 'On site'), F('roster', 'Roster'), F('penerimaan', 'Penerimaan'), F('aksesArea', 'Akses area'), F('mcuTerakhir', 'MCU terakhir'), F('simGol', 'Golongan SIM'), F('simExp', 'SIM berlaku s.d.'), F('unitKimper', 'Unit KIMPER'), F('tnaPosisi', 'Posisi TNA')], skip: ['tna'] });
TABS.push({ name: 'PD - TNA per Karyawan', menu: 'Pusat Data · TNA & Sertifikasi', col: 'employees', long: 'tna', sort: 'nama', asc: true,
  cols: [F('nama', 'Nama'), F('nik', 'NIK'), F('dept', 'Departemen'), F('jabatan', 'Jabatan'), F('tnaPosisi', 'Posisi TNA'), F('training', 'Training'), F('nilai', 'Status (M = wajib, R = rekomendasi, \'1 = sudah)')] });
Object.keys(MON).forEach(k => TABS.push({ name: 'PD - ' + MON[k][0], menu: 'Pusat Data · Monitoring & Peringatan', col: 'monitor', where: d => d.kind === k, sort: 'date', asc: true, skip: ['kind'],
  cols: [F('name', 'Nama / unit'), F('ref', 'NIK / no. referensi'), F('dept', 'Departemen'), F('date', MON[k][1]), F('status', 'Status'), F('note', 'Keterangan'), F('sumber', 'Sumber data'), F('updated', 'Diperbarui')] }));
TABS.push({ name: 'PD - TNA Kebutuhan', menu: 'Pusat Data · TNA & Sertifikasi', col: 'tna_req', sort: 'kelompok', asc: true,
  cols: [F('kelompok', 'Kelompok jabatan'), F('training', 'Training'), F('wajib', 'Tingkat'), F('dasar', 'Dasar')] });
TABS.push({ name: 'PD - Rencana Pelatihan', menu: 'Pusat Data · TNA & Sertifikasi', col: 'tna_plan', sort: 'tanggal', asc: true,
  cols: [F('tanggal', 'Tanggal'), F('judul', 'Judul'), F('training', 'Training'), F('jenis', 'Jenis'), F('jadwal', 'Jadwal'), F('lokasi', 'Lokasi'), F('peserta', 'Peserta'), F('penyelenggara', 'Penyelenggara'), F('biaya', 'Biaya'), F('status', 'Status'), F('sumber', 'Sumber')] });
TABS.push({ name: 'PD - Sertifikat', menu: 'Pusat Data · TNA & Sertifikasi', col: 'certs', sort: 'nama', asc: true, cols: [F('nama', 'Nama'), F('nik', 'NIK')] });
TABS.push({ name: 'PD - Plan Manpower', menu: 'Pusat Data · Database Karyawan', col: 'mp_plan', sort: 'dept', asc: true, cols: [F('dept', 'Departemen'), F('plan', 'Plan manpower'), F('updated', 'Diperbarui')] });
TABS.push({ name: 'PG - Pelanggaran', menu: 'Database Pelanggaran', col: 'violations', sort: 'date',
  cols: [F('reg', 'No. register'), F('date', 'Tanggal'), F('name', 'Nama'), F('nik', 'NIK'), F('jabatan', 'Jabatan'), F('dept', 'Departemen'), F('jenis', 'Jenis pelanggaran'), F('kategori', 'Kategori'), F('lokasi', 'Lokasi'), F('sumber', 'Sumber'), F('kronologi', 'Kronologi'), F('sanksi', 'Sanksi'), F('spNo', 'No. SP'), F('spDate', 'Tgl SP'), F('spUrl', 'File SP'), F('ksDate', 'Tgl konseling'), F('konselor', 'Konselor'), F('ksHasil', 'Hasil konseling'), F('ksUrl', 'File konseling'), F('refresh', 'Refresh training'), F('buktiUrl', 'Bukti'), F('status', 'Status'), F('updated', 'Diperbarui')] });
TABS.push({ name: 'Arsip File Upload', menu: 'Folder & Database', col: 'files', sort: 'at',
  cols: [F('at', 'Waktu upload'), F('kategori', 'Kategori'), F('nama', 'Nama file'), F('url', 'Link file'), F('path', 'Lokasi folder'), F('folderUrl', 'Link folder'), F('oleh', 'Diunggah oleh (email)'), F('olehNama', 'Diunggah oleh'), F('kb', 'Ukuran (KB)'), F('tipe', 'Tipe file'), F('fileId', 'ID file')] });
TABS.push({ name: 'Link Portal', menu: 'Semua menu', col: 'links', sort: 'id', asc: true, cols: [F('url', 'URL'), F('catatan', 'Catatan'), F('urlLama', 'URL lama'), F('updated', 'Diperbarui')] });
const COLS = [...new Set(TABS.map(t => t.col))];
module.exports = { TABS, COLS };
