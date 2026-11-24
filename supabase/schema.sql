-- iAM Smart (Baekhyeon Hwarang SAR) – Supabase schema for lib/adapter-supabase.js
-- Run in the SQL editor of the Supabase project, then enable "Anonymous sign-ins"
-- (Authentication > Sign In / Providers). The private storage bucket "ias-files" is created at the end.
-- Model: every "iAM Smart" app installation signs in anonymously; the account row is bound to that auth user
-- (device_uid). Online services (GovBHG, Immigration Department) are anonymous web pages: they create requests and
-- poll them with a random secret through SECURITY DEFINER functions; they never read tables directly.

create extension if not exists pgcrypto;

create table if not exists public.ias_accounts (
  id            uuid primary key default gen_random_uuid(),
  device_uid    uuid not null,                         -- auth.uid() of the bound phone / browser
  version       text not null default 'basic' check (version in ('basic', 'plus')),
  status        text not null default 'active' check (status in ('active', 'suspended', 'invalid')),
  id_no         text not null,
  name_en       text not null,
  name_local    text not null default '',
  sex           text not null check (sex in ('M', 'F')),
  dob           date not null,
  email         text not null default '',
  email_verified boolean not null default false,
  pin_hash      text not null,                         -- crypt(pin, gen_salt('bf'))
  pin_fail      int  not null default 0,
  parent_id     uuid references public.ias_accounts(id) on delete set null,
  credential_id text,                                  -- WebAuthn credential id (biometric login on the device)
  login_method  text not null default 'pin',
  auto_logout   int  not null default 5,
  created_at    timestamptz not null default now(),
  pin_changed_at timestamptz not null default now(),
  suspended_at  timestamptz
);
create unique index if not exists ias_accounts_id_no on public.ias_accounts (id_no);
create index if not exists ias_accounts_device on public.ias_accounts (device_uid);

create table if not exists public.ias_profiles (            -- "e-ME" profile
  account_id uuid primary key references public.ias_accounts(id) on delete cascade,
  email text default '', email2 text default '', mobile text default '', home_tel text default '', office_tel text default '',
  prefix text default '', education text default '', marital text default '',
  postal_address text default '', residential_address text default '', billing_address text default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.ias_requests (            -- login / e-ME form filling / signing requests from online services
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  secret      text not null,
  client      text not null,
  client_name text not null,
  purpose     text not null check (purpose in ('login', 'eme', 'sign')),
  scope       text[] not null default '{}',
  digest      text not null default '',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  account_id  uuid references public.ias_accounts(id) on delete set null,
  result      jsonb,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 seconds',
  decided_at  timestamptz
);
create index if not exists ias_requests_code on public.ias_requests (code) where status = 'pending';

create table if not exists public.ias_logs (
  n bigserial primary key, account_id uuid references public.ias_accounts(id) on delete cascade,
  action text not null, client text not null default '', at timestamptz not null default now()
);
create table if not exists public.ias_inbox (
  n bigserial primary key, account_id uuid references public.ias_accounts(id) on delete cascade,
  title text not null, body text not null default '', read boolean not null default false, at timestamptz not null default now()
);
create table if not exists public.ias_transfers (
  code text primary key, account_id uuid not null references public.ias_accounts(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- ------------------------------------------------------------------ row level security: the app sees only its own account
alter table public.ias_accounts  enable row level security;
alter table public.ias_profiles  enable row level security;
alter table public.ias_requests  enable row level security;
alter table public.ias_logs      enable row level security;
alter table public.ias_inbox     enable row level security;
alter table public.ias_transfers enable row level security;

create or replace function public.ias_my_account() returns uuid language sql stable security definer set search_path = public, extensions as
$$ select id from public.ias_accounts where device_uid = auth.uid() limit 1 $$;

create policy ias_acc_select on public.ias_accounts for select using (device_uid = auth.uid());
create policy ias_acc_update on public.ias_accounts for update using (device_uid = auth.uid()) with check (device_uid = auth.uid());
create policy ias_prof_all   on public.ias_profiles for all using (account_id = public.ias_my_account()) with check (account_id = public.ias_my_account());
create policy ias_logs_sel   on public.ias_logs for select using (account_id = public.ias_my_account());
create policy ias_inbox_all  on public.ias_inbox for all using (account_id = public.ias_my_account()) with check (account_id = public.ias_my_account());
-- ias_requests / ias_transfers: no direct access; functions below only.

create policy ias_acc_delete on public.ias_accounts for delete using (device_uid = auth.uid());

-- pin_hash must never leave the database: column-level grants only
revoke all on public.ias_accounts from anon, authenticated;
grant select (id, device_uid, version, status, id_no, name_en, name_local, sex, dob, email, email_verified, pin_fail, parent_id,
              credential_id, login_method, auto_logout, created_at, pin_changed_at, suspended_at) on public.ias_accounts to authenticated;
grant update (email, email_verified, login_method, auto_logout, credential_id) on public.ias_accounts to authenticated;   -- status / version only via functions
grant delete on public.ias_accounts to authenticated;
revoke all on public.ias_requests, public.ias_transfers from anon, authenticated;

-- ------------------------------------------------------------------ functions used by the app (authenticated anonymous device)
create or replace function public.ias_register(p jsonb) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- an existing valid account can only be moved with "rebind" (password); an invalid one may be registered again
  if exists (select 1 from public.ias_accounts where id_no = p->>'id_no' and status <> 'invalid') then raise exception 'already_registered'; end if;
  delete from public.ias_accounts where id_no = p->>'id_no';
  delete from public.ias_accounts where device_uid = auth.uid();          -- one account per phone
  insert into public.ias_accounts (device_uid, version, id_no, name_en, name_local, sex, dob, email, pin_hash, parent_id, credential_id, login_method)
  values (auth.uid(), coalesce(p->>'version', 'basic'), p->>'id_no', p->>'name_en', coalesce(p->>'name_local', ''), p->>'sex', (p->>'dob')::date,
          coalesce(p->>'email', ''), crypt(p->>'pin', gen_salt('bf')), nullif(p->>'parent_id', '')::uuid, p->>'credential_id',
          case when coalesce(p->>'credential_id', '') <> '' then 'bio' else 'pin' end)
  returning id into v_id;
  insert into public.ias_profiles (account_id, email) values (v_id, coalesce(p->>'email', ''));
  insert into public.ias_logs (account_id, action, client) values (v_id, 'register', 'iAM Smart');
  return v_id;
end $$;

create or replace function public.ias_verify_pin(p_account uuid, p_pin text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts; v_max int := 10;
begin
  select * into a from public.ias_accounts where id = p_account and device_uid = auth.uid();
  if not found or a.status = 'invalid' then return jsonb_build_object('ok', false, 'invalid', true, 'remaining', 0); end if;
  if a.pin_hash = crypt(p_pin, a.pin_hash) then
    update public.ias_accounts set pin_fail = 0 where id = a.id;
    return jsonb_build_object('ok', true, 'remaining', v_max);
  end if;
  update public.ias_accounts set pin_fail = pin_fail + 1, status = case when pin_fail + 1 >= v_max then 'invalid' else status end where id = a.id
  returning * into a;
  return jsonb_build_object('ok', false, 'invalid', a.status = 'invalid', 'remaining', greatest(0, v_max - a.pin_fail));
end $$;

create or replace function public.ias_set_pin(p_account uuid, p_pin text) returns void language sql security definer set search_path = public, extensions as
$$ update public.ias_accounts set pin_hash = crypt(p_pin, gen_salt('bf')), pin_fail = 0, pin_changed_at = now() where id = p_account and device_uid = auth.uid() $$;

-- consent of parent / guardian: identity card number + password checked together (no lookup of who is registered)
create or replace function public.ias_parent_consent(p_id_no text, p_pin text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts;
begin
  select * into a from public.ias_accounts where id_no = p_id_no and status = 'active';
  if not found then return null; end if;
  if a.pin_hash <> crypt(p_pin, a.pin_hash) then
    update public.ias_accounts set pin_fail = pin_fail + 1, status = case when pin_fail + 1 >= 10 then 'invalid' else status end where id = a.id;
    return null;
  end if;
  update public.ias_accounts set pin_fail = 0 where id = a.id;
  return a.id;
end $$;

create or replace function public.ias_set_status(p_status text) returns void language plpgsql security definer set search_path = public, extensions as $$
begin   -- active <-> suspended only; an invalid account cannot be revived
  update public.ias_accounts set status = p_status, suspended_at = case when p_status = 'suspended' then now() end
   where device_uid = auth.uid() and status in ('active', 'suspended') and p_status in ('active', 'suspended');
end $$;

create or replace function public.ias_upgrade() returns void language sql security definer set search_path = public, extensions as
$$ update public.ias_accounts set version = 'plus' where device_uid = auth.uid() and status = 'active' $$;

create or replace function public.ias_rebind(p_id_no text, p_pin text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts;
begin
  select * into a from public.ias_accounts where id_no = p_id_no;
  if not found or a.status = 'invalid' then return null; end if;
  if a.pin_hash <> crypt(p_pin, a.pin_hash) then                      -- same 10-attempt limit as login
    update public.ias_accounts set pin_fail = pin_fail + 1, status = case when pin_fail + 1 >= 10 then 'invalid' else status end where id = a.id;
    return null;
  end if;
  update public.ias_accounts set device_uid = auth.uid(), status = 'active', suspended_at = null, pin_fail = 0 where id = a.id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'rebind', 'iAM Smart');
  return a.id;
end $$;

create or replace function public.ias_create_transfer(p_account uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
declare v text := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
begin
  if not exists (select 1 from public.ias_accounts where id = p_account and device_uid = auth.uid()) then raise exception 'forbidden'; end if;
  insert into public.ias_transfers (code, account_id) values (v, p_account);
  return v;
end $$;

create or replace function public.ias_claim_transfer(p_code text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare t public.ias_transfers;
begin
  delete from public.ias_transfers where code = upper(p_code) and expires_at > now() returning * into t;
  if not found then return null; end if;
  update public.ias_accounts set device_uid = auth.uid() where id = t.account_id;
  return t.account_id;
end $$;

create or replace function public.ias_request_by_code(p_code text) returns jsonb language sql stable security definer set search_path = public, extensions as
$$ select to_jsonb(r) - 'secret' from public.ias_requests r where code = upper(p_code) and status = 'pending' and expires_at > now() limit 1 $$;

create or replace function public.ias_request(p_id uuid) returns jsonb language sql stable security definer set search_path = public, extensions as
$$ select to_jsonb(r) - 'secret' from public.ias_requests r where id = p_id $$;

create or replace function public.ias_decide(p_id uuid, p_approve boolean) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.ias_requests; a public.ias_accounts; pr public.ias_profiles; res jsonb; k text; src jsonb;
begin
  select * into a from public.ias_accounts where device_uid = auth.uid() and status = 'active';
  if not found then raise exception 'no active account on this device'; end if;
  select * into r from public.ias_requests where id = p_id and status = 'pending' for update;
  if not found then return null; end if;
  if r.expires_at < now() then update public.ias_requests set status = 'expired' where id = p_id; return jsonb_build_object('status', 'expired'); end if;
  if not p_approve then update public.ias_requests set status = 'rejected', account_id = a.id, decided_at = now() where id = p_id; return jsonb_build_object('status', 'rejected'); end if;
  select * into pr from public.ias_profiles where account_id = a.id;
  src := jsonb_build_object('id_no', a.id_no, 'name_en', a.name_en, 'name_local', a.name_local, 'sex', a.sex, 'dob', a.dob, 'email', coalesce(nullif(pr.email, ''), a.email),
                            'mobile', pr.mobile, 'home_tel', pr.home_tel, 'office_tel', pr.office_tel, 'prefix', pr.prefix, 'education', pr.education,
                            'marital', pr.marital, 'postal_address', pr.postal_address, 'residential_address', pr.residential_address);
  res := jsonb_build_object('sub', left(encode(digest(a.id_no || '|' || r.client, 'sha256'), 'hex'), 32), 'name_en', a.name_en, 'version', a.version);
  if r.purpose in ('login', 'eme') then
    foreach k in array r.scope loop
      if src ? k then res := res || jsonb_build_object(k, coalesce(src->>k, '')); end if;
    end loop;
  elsif r.purpose = 'sign' then
    if a.version <> 'plus' then raise exception 'digital signing requires iAM Smart+'; end if;
    res := res || jsonb_build_object('signature', encode(digest(a.id::text || '|' || r.digest || '|' || now()::text, 'sha256'), 'hex'),
                                     'signed_at', now(), 'cert', 'iAM Smart-Cert ' || upper(left(a.id::text, 8)));
  end if;
  update public.ias_requests set status = 'approved', account_id = a.id, result = res, decided_at = now() where id = p_id;
  insert into public.ias_logs (account_id, action, client) values (a.id, r.purpose, r.client_name);
  return jsonb_build_object('status', 'approved');
end $$;

-- ------------------------------------------------------------------ functions used by online services (anonymous web pages)
create or replace function public.ias_create_request(p_client text, p_client_name text, p_purpose text, p_scope text[], p_digest text default '')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.ias_requests;
begin
  insert into public.ias_requests (code, secret, client, client_name, purpose, scope, digest)
  values (upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)), encode(gen_random_bytes(18), 'hex'), p_client, p_client_name, p_purpose, coalesce(p_scope, '{}'), coalesce(p_digest, ''))
  returning * into r;
  return jsonb_build_object('id', r.id, 'code', r.code, 'secret', r.secret, 'expires_at', r.expires_at);
end $$;

create or replace function public.ias_poll(p_id uuid, p_secret text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.ias_requests;
begin
  select * into r from public.ias_requests where id = p_id and secret = p_secret;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  if r.status = 'pending' and r.expires_at < now() then update public.ias_requests set status = 'expired' where id = p_id; r.status := 'expired'; end if;
  return jsonb_build_object('status', r.status, 'result', case when r.status = 'approved' then r.result end);
end $$;

create or replace function public.ias_stats() returns jsonb language sql stable security definer set search_path = public, extensions as
$$ select jsonb_build_object('regs', (select count(*) from public.ias_accounts), 'uses', (select count(*) from public.ias_logs)) $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.ias_create_request(text, text, text, text[], text), public.ias_poll(uuid, text), public.ias_stats() to anon, authenticated;
grant execute on function public.ias_register(jsonb), public.ias_verify_pin(uuid, text), public.ias_set_pin(uuid, text), public.ias_parent_consent(text, text),
  public.ias_set_status(text), public.ias_upgrade(), public.ias_my_account(),
  public.ias_rebind(text, text), public.ias_create_transfer(uuid), public.ias_claim_transfer(text), public.ias_request_by_code(text),
  public.ias_request(uuid), public.ias_decide(uuid, boolean) to authenticated;

-- storage: private bucket "ias-files", objects stored as <account_id>/<kind>.jpg
create policy ias_files_rw on storage.objects for all to authenticated
  using (bucket_id = 'ias-files' and (storage.foldername(name))[1] = public.ias_my_account()::text)
  with check (bucket_id = 'ias-files' and (storage.foldername(name))[1] = public.ias_my_account()::text);

insert into storage.buckets (id, name, public) values ('ias-files', 'ias-files', false) on conflict (id) do nothing;

-- =========================================================================================================
-- Migration 2 (ias_issue_id_and_records): the identity card number is issued on registration;
-- Immigration Department / GovBHG records (e-Visa, appointment bookings) are kept in the same database.
-- =========================================================================================================
alter table public.ias_accounts
  add column if not exists pob text not null default 'BHG',
  add column if not exists res_status text not null default 'A' check (res_status in ('A', 'R', 'U', 'C')),
  add column if not exists nationality text not null default 'KOR',
  add column if not exists card_issued_at timestamptz not null default now();
grant select (pob, res_status, nationality, card_issued_at) on public.ias_accounts to authenticated;

create or replace function public.ias_id_check(p_letters text, p_digits text) returns text language plpgsql immutable set search_path = public, extensions as $$
declare s int; i int; k int;
begin
  if length(p_letters) = 1 then s := 36 * 9 + (ascii(p_letters) - 55) * 8;
  else s := (ascii(substr(p_letters, 1, 1)) - 55) * 9 + (ascii(substr(p_letters, 2, 1)) - 55) * 8; end if;
  for i in 1..6 loop s := s + (substr(p_digits, i, 1))::int * (8 - i); end loop;
  k := (11 - s % 11) % 11;
  return case when k = 10 then 'A' else k::text end;
end $$;

create or replace function public.ias_new_id_no() returns text language plpgsql volatile set search_path = public, extensions as $$
declare l text; d text; v text; n int := 0;
begin
  loop
    l := substr('ABCDEGHKMNPRSTVZ', 1 + floor(random() * 16)::int, 1);
    d := lpad(floor(random() * 1000000)::int::text, 6, '0');
    v := l || d || '(' || public.ias_id_check(l, d) || ')';
    exit when not exists (select 1 from public.ias_accounts where id_no = v);
    n := n + 1; if n > 50 then raise exception 'could not allocate an identity card number'; end if;
  end loop;
  return v;
end $$;

create or replace function public.ias_register(p jsonb) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.ias_accounts where device_uid = auth.uid() and status <> 'invalid') then raise exception 'device_has_account'; end if;
  delete from public.ias_accounts where device_uid = auth.uid();
  insert into public.ias_accounts (device_uid, version, id_no, name_en, name_local, sex, dob, email, pin_hash, parent_id, credential_id, login_method,
                                   pob, res_status, nationality)
  values (auth.uid(), 'basic', public.ias_new_id_no(), upper(p->>'name_en'), coalesce(p->>'name_local', ''), p->>'sex', (p->>'dob')::date,
          coalesce(p->>'email', ''), crypt(p->>'pin', gen_salt('bf')), nullif(p->>'parent_id', '')::uuid, p->>'credential_id',
          case when coalesce(p->>'credential_id', '') <> '' then 'bio' else 'pin' end,
          coalesce(nullif(p->>'pob', ''), 'BHG'), coalesce(nullif(p->>'res_status', ''), 'A'), coalesce(nullif(p->>'nationality', ''), 'KOR'))
  returning id into v_id;
  insert into public.ias_profiles (account_id, email) values (v_id, coalesce(p->>'email', ''));
  insert into public.ias_logs (account_id, action, client) values (v_id, 'register', 'iAM Smart');
  return v_id;
end $$;

create table if not exists public.imm_evisas (ref text primary key, rec jsonb not null, created_at timestamptz not null default now());
create table if not exists public.imm_bookings (ref text primary key, code_hash text not null, data jsonb not null, created_at timestamptz not null default now());
alter table public.imm_evisas enable row level security;
alter table public.imm_bookings enable row level security;
revoke all on public.imm_evisas, public.imm_bookings from anon, authenticated;

create or replace function public.imm_save_evisa(p_ref text, p_rec jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_ref !~ '^[A-Z]{4}-\d{7}-\d{2}\(\d\)$' then raise exception 'bad reference'; end if;
  insert into public.imm_evisas (ref, rec) values (p_ref, p_rec);
end $$;
create or replace function public.imm_get_evisa(p_ref text, p_dob text) returns jsonb language sql stable security definer set search_path = public, extensions as
$$ select e.rec from public.imm_evisas e where e.ref = upper(p_ref) and exists (select 1 from jsonb_array_elements(e.rec->'people') x where x->>'dob' = p_dob) $$;
create or replace function public.imm_save_booking(p_ref text, p_code text, p_data jsonb) returns void language sql security definer set search_path = public, extensions as
$$ insert into public.imm_bookings (ref, code_hash, data) values (upper(p_ref), crypt(p_code, gen_salt('bf')), p_data) $$;
create or replace function public.imm_find_booking(p_ref text, p_code text) returns jsonb language sql stable security definer set search_path = public, extensions as
$$ select data from public.imm_bookings where ref = upper(p_ref) and code_hash = crypt(p_code, code_hash) $$;
create or replace function public.imm_cancel_booking(p_ref text, p_code text) returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.imm_bookings where ref = upper(p_ref) and code_hash = crypt(p_code, code_hash);
  return found;
end $$;
create or replace function public.ias_my_documents() returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(e.rec order by e.created_at desc), '[]'::jsonb)
    from public.imm_evisas e, public.ias_accounts a
   where a.device_uid = auth.uid() and a.status = 'active'
     and exists (select 1 from jsonb_array_elements(e.rec->'people') x
                  where x->>'dob' = a.dob::text and regexp_replace(upper(x->>'name'), '\s+', ' ', 'g') = regexp_replace(upper(a.name_en), '\s+', ' ', 'g'))
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.ias_create_request(text, text, text, text[], text), public.ias_poll(uuid, text), public.ias_stats(),
  public.imm_save_evisa(text, jsonb), public.imm_get_evisa(text, text), public.imm_save_booking(text, text, jsonb),
  public.imm_find_booking(text, text), public.imm_cancel_booking(text, text) to anon, authenticated;
grant execute on function public.ias_register(jsonb), public.ias_verify_pin(uuid, text), public.ias_set_pin(uuid, text), public.ias_parent_consent(text, text),
  public.ias_set_status(text), public.ias_upgrade(), public.ias_my_account(), public.ias_my_documents(),
  public.ias_rebind(text, text), public.ias_create_transfer(uuid), public.ias_claim_transfer(text), public.ias_request_by_code(text),
  public.ias_request(uuid), public.ias_decide(uuid, boolean) to authenticated;

-- Migration 3 (ias_decide_full_profile): login returns the whole profile needed for applications
create or replace function public.ias_decide(p_id uuid, p_approve boolean) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.ias_requests; a public.ias_accounts; pr public.ias_profiles; res jsonb; k text; src jsonb;
begin
  select * into a from public.ias_accounts where device_uid = auth.uid() and status = 'active';
  if not found then raise exception 'no active account on this device'; end if;
  select * into r from public.ias_requests where id = p_id and status = 'pending' for update;
  if not found then return null; end if;
  if r.expires_at < now() then update public.ias_requests set status = 'expired' where id = p_id; return jsonb_build_object('status', 'expired'); end if;
  if not p_approve then update public.ias_requests set status = 'rejected', account_id = a.id, decided_at = now() where id = p_id; return jsonb_build_object('status', 'rejected'); end if;
  select * into pr from public.ias_profiles where account_id = a.id;
  src := jsonb_build_object('id_no', a.id_no, 'name_en', a.name_en, 'name_local', a.name_local, 'sex', a.sex, 'dob', a.dob,
                            'pob', a.pob, 'nationality', a.nationality, 'res_status', a.res_status, 'email', coalesce(nullif(pr.email, ''), a.email),
                            'email2', pr.email2, 'mobile', pr.mobile, 'home_tel', pr.home_tel, 'office_tel', pr.office_tel, 'prefix', pr.prefix, 'education', pr.education,
                            'marital', pr.marital, 'postal_address', pr.postal_address, 'residential_address', pr.residential_address, 'billing_address', pr.billing_address);
  res := jsonb_build_object('sub', left(encode(digest(a.id_no || '|' || r.client, 'sha256'), 'hex'), 32), 'name_en', a.name_en, 'version', a.version);
  if r.purpose in ('login', 'eme') then
    foreach k in array r.scope loop
      if src ? k then res := res || jsonb_build_object(k, coalesce(src->>k, '')); end if;
    end loop;
  elsif r.purpose = 'sign' then
    if a.version <> 'plus' then raise exception 'digital signing requires iAM Smart+'; end if;
    res := res || jsonb_build_object('signature', encode(digest(a.id::text || '|' || r.digest || '|' || now()::text, 'sha256'), 'hex'),
                                     'signed_at', now(), 'cert', 'iAM Smart-Cert ' || upper(left(a.id::text, 8)));
  end if;
  update public.ias_requests set status = 'approved', account_id = a.id, result = res, decided_at = now() where id = p_id;
  insert into public.ias_logs (account_id, action, client) values (a.id, r.purpose, r.client_name);
  return jsonb_build_object('status', 'approved');
end $$;

-- Migration 4 (ias_face_verification) and 5 (ias_request_ttl_and_lookup): face descriptors (never readable by clients),
-- same-person checks, one face = one account, rebind with password + face; requests valid for 180 seconds and
-- looked up by code whatever their status. Applied to project BHG through the Supabase migrations of the same names;
-- see supabase/migrations/ for the exact SQL.
