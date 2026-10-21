# Portal SHE · paket instalasi

Aplikasi web K3 & lingkungan untuk perusahaan tambang/kontraktor: formulir harian (P2H, Fit to Work, Observasi, Inspeksi,
Hazard, Insiden, Induksi, Izin Area, Perbaikan Unit), SAP mingguan, database karyawan, MCU, Mine Permit, KIMPER, SPIP, TNA,
pelanggaran, arsip Google Drive otomatis, serta Google Sheets yang terisi sendiri (Database SAP & Database Raw Data).

Pengembang awal: Aditya Tul Iqram.

**Panduan lengkap ada di Modul Instalasi.** Ringkasnya:

| Langkah | Di mana | File di paket ini |
|---|---|---|
| 1. Database | Supabase › SQL Editor | `supabase/1-install.sql` (ganti email admin dulu) |
| 2. Google Drive & Sheets | script.google.com | `apps-script/Code.gs` → jalankan `setup()` |
| 3. Identitas perusahaan | GitHub (edit file) | `portal.config.json`, logo di `branding/` |
| 4. Online | Vercel (import dari GitHub) | otomatis: `tools/build.js` |
| 5. Sambungkan sinkron | Supabase › SQL Editor | `supabase/2-setelah-vercel.sql` |

## Environment Variables di Vercel

| Nama | Isi | Dari mana |
|---|---|---|
| `SUPABASE_URL` | https://xxxx.supabase.co | Supabase › Project Settings › API |
| `SUPABASE_ANON_KEY` | kunci "anon public" | Supabase › Project Settings › API |
| `SYNC_SECRET` | kata rahasia sinkron | hasil akhir `1-install.sql` |
| `GAS_UPLOAD_URL` | URL …/exec | Apps Script › Deploy › Aplikasi web |
| `GAS_SECRET` | kata rahasia Apps Script | Log eksekusi `setup()` |

## Isi paket

```
portal.config.json      identitas perusahaan, folder Drive, minggu acuan SAP
branding/               logo (PNG/JPG/SVG, maks. 400 KB)
src/portal.template.html  aplikasi (satu file)
js/sb-adapter.js        penghubung ke Supabase
api/                    fungsi server Vercel (upload Drive, sinkron SAP & Raw Data)
apps-script/Code.gs     penerima upload + penulis Google Sheets
supabase/*.sql          skrip database
tools/build.js          perakit portal (dijalankan Vercel)
```

Data tiap perusahaan sepenuhnya terpisah: masing-masing memakai akun Supabase, Vercel dan Google Drive sendiri.
