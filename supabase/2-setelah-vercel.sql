-- =====================================================================
--  PORTAL SHE · SAMBUNGKAN DATABASE KE PORTAL (jalankan SETELAH portal online di Vercel)
--  Ganti alamat di baris bertanda (1) dengan alamat portal Anda, lalu Run.
--  Aman dijalankan ulang (misalnya bila alamat portal berubah).
-- =====================================================================
do $$
declare
  alamat text := 'https://GANTI-NAMA-PROYEK.vercel.app';   -- (1) alamat portal Anda, tanpa garis miring di akhir
  u text;
begin
  if alamat like '%GANTI-NAMA-PROYEK%' then raise exception 'Ganti dulu alamat portal di baris (1).'; end if;
  u := rtrim(trim(alamat), '/') || '/api/sap-sync';
  if exists (select 1 from vault.secrets where name = 'sap_sync_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'sap_sync_url'), u);
  else
    perform vault.create_secret(u, 'sap_sync_url');
  end if;
end $$;

-- Isi awal Google Sheet (Database SAP & Database Raw Data). Selesai ±1 menit.
select public.sap_sync_full() as sinkron_sap, public.raw_sync_full() as sinkron_raw_data;
