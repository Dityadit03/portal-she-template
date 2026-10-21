-- =====================================================================
--  PORTAL SHE · INSTALASI DATABASE (Supabase)
--  Cara pakai: Supabase > SQL Editor > New query > tempel SELURUH isi file ini > Run.
--  Aman dijalankan ulang.
--
--  >>> WAJIB: ganti email di baris bertanda (1) dengan email admin pertama. <<<
--  Orang yang mendaftar dengan email itu otomatis menjadi Admin.
-- =====================================================================

-- (1) EMAIL ADMIN PERTAMA ------------------------------------------------
create table if not exists public.app_settings (key text primary key, value text not null);
do $$
declare email_admin text := 'GANTI-DENGAN-EMAIL-ADMIN@contoh.com';   -- <<< (1) GANTI DENGAN EMAIL ADMIN
begin
  email_admin := lower(trim(email_admin));
  if email_admin like 'ganti-dengan-email%' or position('@' in email_admin) = 0 then
    raise exception 'Ganti dulu email admin pertama pada baris (1), lalu jalankan lagi.';
  end if;
  insert into public.app_settings(key, value) values ('admin_email', email_admin)
  on conflict (key) do update set value = excluded.value;
end $$;
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- (2) EKSTENSI -------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- (3) TABEL ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nama text not null default '',
  nik text not null default '',
  dept text not null default '',
  jabatan text not null default '',
  alasan text not null default '',
  minta text not null default 'user' check (minta in ('user','viewer')),
  role text not null default 'pending' check (role in ('admin','user','viewer','pending','rejected','blocked')),
  catatan text not null default '',
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);

create table if not exists public.docs (
  col text not null check (col ~ '^[a-z_]{2,40}$'),
  id text not null check (length(id) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (col, id)
);
create index if not exists docs_col_idx on public.docs(col);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  uid uuid, col text, doc_id text, op text, data jsonb
);

create table if not exists public.raw_dirty (
  col text primary key,
  at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.docs enable row level security;
alter table public.audit_log enable row level security;
alter table public.raw_dirty enable row level security;
revoke all on public.raw_dirty from anon, authenticated;

-- (4) FUNGSI ---------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.user_can_input(p_col text) returns boolean
language sql immutable set search_path = '' as $$
  select p_col = any (array['daily','repairs','violations','monitor','exports','files'])
$$;

create or replace function public.doc_merge(p_col text, p_id text, p_patch jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare n int;
begin
  update public.docs set data = data || p_patch where col = p_col and id = p_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.is_first_admin_email(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(coalesce(p_email,'')) = (select value from public.app_settings where key = 'admin_email')
     and not exists (select 1 from public.profiles where role = 'admin')
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles(id, email, nama, nik, dept, jabatan, alasan, minta, role)
  values (new.id, new.email,
    left(coalesce(m->>'nama',''),80), left(coalesce(m->>'nik',''),20), left(coalesce(m->>'dept',''),40),
    left(coalesce(m->>'jabatan',''),60), left(coalesce(m->>'alasan',''),140),
    case when m->>'minta' = 'viewer' then 'viewer' else 'user' end,
    case when new.email_confirmed_at is not null and public.is_first_admin_email(new.email) then 'admin' else 'pending' end)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.bootstrap_owner_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and public.is_first_admin_email(new.email) then
    update public.profiles set role = 'admin', reviewed_at = now() where id = new.id;
  end if;
  return new;
end $$;

create or replace function public.docs_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log(uid,col,doc_id,op,data) values (auth.uid(), old.col, old.id, 'delete', old.data);
    return old;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into public.audit_log(uid,col,doc_id,op,data) values (auth.uid(), new.col, new.id, lower(tg_op), null);
  return new;
end $$;

-- sinkron SAP ke Google Sheet (dipanggil trigger)
create or replace function public.sap_sync_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.docs; u text; s text; t text[] := array['hazard','observasi','inspeksi'];
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if r.col not in ('daily','sap_people','sap_week','sap_rec','sap_cfg') then return null; end if;
  if r.col = 'daily' and not ((tg_op <> 'DELETE' and coalesce(new.data->>'type','') = any(t)) or (tg_op <> 'INSERT' and coalesce(old.data->>'type','') = any(t))) then return null; end if;
  select decrypted_secret into u from vault.decrypted_secrets where name = 'sap_sync_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'sap_sync_secret';
  if u is null or s is null then return null; end if;
  perform net.http_post(
    url := u,
    body := jsonb_build_object('op', tg_op, 'col', r.col, 'id', r.id,
              'data', case when tg_op = 'DELETE' then null else new.data end,
              'old', case when tg_op = 'UPDATE' and r.col = 'daily' then jsonb_build_object('tanggal', old.data->>'tanggal') else null end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', s),
    timeout_milliseconds := 60000);
  return null;
end $$;

create or replace function public.sap_export(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'sap_sync_secret';
  if s is null or p_secret is distinct from s then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id) || data), '[]'::jsonb) from public.docs where col = 'sap_people'),
    'rec',    (select coalesce(jsonb_object_agg(id, data), '{}'::jsonb) from public.docs where col = 'sap_rec'),
    'week',   (select coalesce(jsonb_object_agg(id, data), '{}'::jsonb) from public.docs where col = 'sap_week'),
    'cfg',    (select data from public.docs where col = 'sap_cfg' and id = 'cfg'),
    'daily',  (select coalesce(jsonb_agg(jsonb_build_object('id', id) || data), '[]'::jsonb) from public.docs
               where col = 'daily' and data->>'type' in ('hazard','observasi','inspeksi') and coalesce(data->>'tanggal','') >= to_char(current_date - 150, 'YYYY-MM-DD')));
end $$;

create or replace function public.sap_sync_full() returns bigint
language plpgsql security definer set search_path = '' as $$
declare u text; s text;
begin
  if auth.uid() is not null and (select public.my_role()) is distinct from 'admin' then raise exception 'forbidden'; end if;
  select decrypted_secret into u from vault.decrypted_secrets where name = 'sap_sync_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'sap_sync_secret';
  if u is null then raise exception 'sap_sync_url belum diisi (jalankan 2-setelah-vercel.sql)'; end if;
  return net.http_post(url := u, body := '{"op":"FULL"}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-sync-secret', s), timeout_milliseconds := 60000);
end $$;

-- sinkron Raw Data (semua data aplikasi) ke Google Sheet
create or replace function public.raw_mark_dirty() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text := coalesce(new.col, old.col);
begin
  if c in ('daily','repairs','sap_people','sap_rec','employees','monitor','tna_req','tna_plan','certs','mp_plan','violations','files','links') then
    insert into public.raw_dirty(col, at) values (c, now()) on conflict (col) do update set at = excluded.at;
  end if;
  return null;
end $$;

create or replace function public.raw_export(p_secret text, p_cols text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'sap_sync_secret';
  if s is null or p_secret is distinct from s then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_object_agg(c, (select coalesce(jsonb_agg(jsonb_build_object('id', d.id) || d.data order by d.id), '[]'::jsonb) from public.docs d where d.col = c)), '{}'::jsonb)
          from unnest(p_cols) c
          where c in ('daily','repairs','sap_people','sap_rec','employees','monitor','tna_req','tna_plan','certs','mp_plan','violations','files','links'));
end $$;

create or replace function public.raw_flush() returns bigint
language plpgsql security definer set search_path = '' as $$
declare u text; s text; cols text[];
begin
  select replace(decrypted_secret, '/api/sap-sync', '/api/raw-sync') into u from vault.decrypted_secrets where name = 'sap_sync_url';
  if u is null then return null; end if;
  with x as (delete from public.raw_dirty returning col) select array_agg(col) into cols from x;
  if cols is null then return null; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'sap_sync_secret';
  return net.http_post(url := u, body := jsonb_build_object('cols', to_jsonb(cols)), headers := jsonb_build_object('Content-Type','application/json','x-sync-secret', s), timeout_milliseconds := 60000);
end $$;

create or replace function public.raw_sync_full() returns bigint
language plpgsql security definer set search_path = '' as $$
declare u text; s text;
begin
  if auth.uid() is not null and (select public.my_role()) is distinct from 'admin' then raise exception 'forbidden'; end if;
  select replace(decrypted_secret, '/api/sap-sync', '/api/raw-sync') into u from vault.decrypted_secrets where name = 'sap_sync_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'sap_sync_secret';
  if u is null then raise exception 'sap_sync_url belum diisi (jalankan 2-setelah-vercel.sql)'; end if;
  return net.http_post(url := u, body := '{"op":"FULL"}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-sync-secret', s), timeout_milliseconds := 60000);
end $$;

-- (5) TRIGGER --------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after insert or update of email_confirmed_at on auth.users for each row execute function public.bootstrap_owner_admin();
drop trigger if exists docs_audit_trg on public.docs;
create trigger docs_audit_trg before insert or update or delete on public.docs for each row execute function public.docs_audit();
drop trigger if exists docs_sap_sync on public.docs;
create trigger docs_sap_sync after insert or update or delete on public.docs for each row execute function public.sap_sync_notify();
drop trigger if exists docs_raw_dirty on public.docs;
create trigger docs_raw_dirty after insert or update or delete on public.docs for each row execute function public.raw_mark_dirty();

-- (6) HAK AKSES (Row Level Security) -----------------------------------------
drop policy if exists prof_select on public.profiles;
create policy prof_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.my_role()) = 'admin');
drop policy if exists prof_update_admin on public.profiles;
create policy prof_update_admin on public.profiles for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs for select to authenticated
  using ((select public.my_role()) = any (array['admin','user','viewer']));
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated
  with check ((select public.my_role()) = 'admin' or ((select public.my_role()) = 'user' and public.user_can_input(col)));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using ((select public.my_role()) = 'admin' or ((select public.my_role()) = 'user' and public.user_can_input(col)))
  with check ((select public.my_role()) = 'admin' or ((select public.my_role()) = 'user' and public.user_can_input(col)));
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated
  using ((select public.my_role()) = 'admin');

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using ((select public.my_role()) = 'admin');

-- izin menjalankan fungsi: hanya yang perlu
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.user_can_input(text) to authenticated;
grant execute on function public.doc_merge(text, text, jsonb) to authenticated;
grant execute on function public.sap_sync_full() to authenticated;
grant execute on function public.raw_sync_full() to authenticated;
grant execute on function public.sap_export(text) to anon;          -- dilindungi kata rahasia
grant execute on function public.raw_export(text, text[]) to anon;  -- dilindungi kata rahasia

-- (7) REALTIME (data langsung berubah di semua layar) -------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- (8) KATA RAHASIA SINKRON + JADWAL TIAP MENIT --------------------------------
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'sap_sync_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'sap_sync_secret');
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'raw-sync-flush';
select cron.schedule('raw-sync-flush', '* * * * *', $$select public.raw_flush()$$);

-- (9) SELESAI. Salin nilai di bawah ini ke Vercel sebagai SYNC_SECRET (rahasiakan).
select 'SELESAI · admin pertama: ' || (select value from public.app_settings where key = 'admin_email') as status,
       decrypted_secret as sync_secret_untuk_vercel
from vault.decrypted_secrets where name = 'sap_sync_secret';
