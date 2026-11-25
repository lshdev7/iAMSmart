-- 1. First letter of the identity card number: births in BHG follow the birth register (Z 1980-88, Y 1989-Mar 2005,
--    S Apr 2005-May 2019, N from June 2019); everyone else is first registered now (L, from 27 July 2026).
create or replace function public.ias_id_prefix(p_pob text, p_dob date) returns text language sql immutable set search_path = public, extensions as
$$ select case when p_pob is distinct from 'BHG' or p_dob is null or p_dob < date '1980-01-01' then 'L'
               when p_dob < date '1989-01-01' then 'Z' when p_dob < date '2005-04-01' then 'Y' when p_dob < date '2019-06-01' then 'S' else 'N' end $$;

-- 2. Changed numbers: the former number works until its holder has read the notice (id_ack_at)
alter table public.ias_accounts add column if not exists old_id_no text, add column if not exists id_ack_at timestamptz;
grant select (old_id_no, id_ack_at) on public.ias_accounts to authenticated;

drop function if exists public.ias_new_id_no();
create or replace function public.ias_new_id_no(p_pob text, p_dob date) returns text language plpgsql volatile set search_path = public, extensions as $$
declare l text := public.ias_id_prefix(p_pob, p_dob); d text; v text; n int := 0;
begin
  loop
    d := lpad(floor(random() * 1000000)::int::text, 6, '0');
    v := l || d || '(' || public.ias_id_check(l, d) || ')';
    exit when not exists (select 1 from public.ias_accounts where id_no = v or old_id_no = v);
    n := n + 1; if n > 50 then raise exception 'could not allocate an identity card number'; end if;
  end loop;
  return v;
end $$;

do $$ begin
  execute replace(pg_get_functiondef('public.ias_register(jsonb)'::regprocedure), 'public.ias_new_id_no()',
                  'public.ias_new_id_no(coalesce(nullif(p->>''pob'', ''''), ''BHG''), (p->>''dob'')::date)');
  -- the identifier given to an online service must not change with the number
  execute replace(pg_get_functiondef('public.ias_decide(uuid, boolean)'::regprocedure), 'digest(a.id_no ||', 'digest(coalesce(a.old_id_no, a.id_no) ||');
  -- parent's consent by card number
  execute replace(pg_get_functiondef('public.ias_parent_consent(text, text)'::regprocedure), 'where id_no = p_id_no and status',
                  'where (id_no = p_id_no or (old_id_no = p_id_no and id_ack_at is null)) and status');
  execute replace(pg_get_functiondef('public.ias_kiosk_suspend(text, jsonb)'::regprocedure), 'where id_no = p_id_no and status',
                  'where (id_no = p_id_no or (old_id_no = p_id_no and id_ack_at is null)) and status');
end $$;

create or replace function public.ias_rebind(p_id_no text, p_pin text, p_desc jsonb) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts; v real[] := public.ias_desc(p_desc);
begin
  select * into a from public.ias_accounts where id_no = p_id_no or old_id_no = p_id_no;
  if not found or a.status = 'invalid' then return null; end if;
  if exists (select 1 from public.ias_accounts where device_uid = auth.uid() and id <> a.id) then raise exception 'device_has_account'; end if;
  if a.pin_hash <> crypt(p_pin, a.pin_hash) or (a.face_desc is not null and (v is null or public.ias_face_dist(a.face_desc, v) >= 0.55)) then
    update public.ias_accounts set pin_fail = pin_fail + 1, status = case when pin_fail + 1 >= 10 then 'invalid' else status end where id = a.id;
    return null;
  end if;
  if a.id_no <> p_id_no and a.id_ack_at is not null then raise exception 'id_changed:%', a.id_no; end if;   -- identity proven: tell the new number
  update public.ias_accounts set device_uid = auth.uid(), status = 'active', suspended_at = null, pin_fail = 0, face_verified_at = now() where id = a.id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'rebind', 'iAM Smart');
  return a.id;
end $$;

create or replace function public.ias_ack_id() returns void language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts;
begin
  update public.ias_accounts set id_ack_at = now() where device_uid = auth.uid() and old_id_no is not null and id_ack_at is null returning * into a;
  if found then insert into public.ias_logs (account_id, action, client) values (a.id, 'id_ack', 'iAM Smart'); end if;
end $$;

-- 3. The card shown at the kiosk. A view lets one kiosk session read the photograph for a few minutes.
create table if not exists public.ias_card_views (account_id uuid not null references public.ias_accounts(id) on delete cascade, uid uuid not null,
  expires_at timestamptz not null, primary key (account_id, uid));
create table if not exists public.ias_card_tries (uid uuid not null, account_id uuid, at timestamptz not null default now());
alter table public.ias_card_views enable row level security;
alter table public.ias_card_tries enable row level security;
revoke all on public.ias_card_views, public.ias_card_tries from anon, authenticated;

create or replace function public.ias_card_json(a public.ias_accounts) returns jsonb language sql stable set search_path = public, extensions as
$$ select jsonb_build_object('account_id', a.id, 'id_no', a.id_no, 'name_en', a.name_en, 'name_local', a.name_local, 'sex', a.sex, 'dob', a.dob, 'pob', a.pob,
     'nationality', a.nationality, 'res_status', a.res_status, 'card_issued_at', a.card_issued_at, 'created_at', a.created_at, 'version', a.version) $$;
create or replace function public.ias_may_view_card(p text) returns boolean language sql stable security definer set search_path = public, extensions as
$$ select exists (select 1 from public.ias_card_views where account_id::text = p and uid = auth.uid() and expires_at > now()) $$;
drop policy if exists ias_files_card_view on storage.objects;
create policy ias_files_card_view on storage.objects for select to authenticated
  using (bucket_id = 'ias-files' and storage.filename(name) = 'face.jpg' and public.ias_may_view_card((storage.foldername(name))[1]));

-- suspension at the kiosk: the card of a number. Limited per kiosk session, per card and in total; the holder is told.
create or replace function public.ias_kiosk_card(p_id_no text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.ias_card_tries where at < now() - interval '1 day';
  delete from public.ias_card_views where expires_at < now();
  if (select count(*) from public.ias_card_tries where uid = auth.uid() and at > now() - interval '1 hour') >= 6
     or (select count(*) from public.ias_card_tries where account_id is null and at > now() - interval '1 hour') >= 120 then
    return jsonb_build_object('error', 'too_many');
  end if;
  select * into a from public.ias_accounts where (id_no = p_id_no or (old_id_no = p_id_no and id_ack_at is null)) and status in ('active', 'suspended');
  insert into public.ias_card_tries (uid, account_id) values (auth.uid(), a.id);
  if a.id is null then return jsonb_build_object('error', 'unknown'); end if;
  if (select count(*) from public.ias_card_tries where account_id = a.id and at > now() - interval '1 hour') > 10 then return jsonb_build_object('error', 'too_many'); end if;
  insert into public.ias_card_views values (a.id, auth.uid(), now() + interval '5 minutes') on conflict (account_id, uid) do update set expires_at = excluded.expires_at;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'card_view', 'iAM Smart Kiosk');
  insert into public.ias_inbox (account_id, title, body) values (a.id, '@mail_card_title', '@mail_card_body');
  return public.ias_card_json(a);
end $$;

create or replace function public.ias_kiosk_get(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; a public.ias_accounts; r jsonb;
begin
  select * into s from public.ias_kiosk_sessions where id = p_id;
  if not found then return null; end if;
  r := jsonb_build_object('id', s.id, 'kind', s.kind, 'minor', s.minor, 'scanned', s.phone_uid is not null, 'parent', s.parent_id is not null,
                          'mine', s.phone_uid is not distinct from auth.uid(), 'expires_at', s.expires_at,
                          'status', case when s.status in ('waiting', 'scanned', 'captured') and s.expires_at < now() then 'expired' else s.status end);
  if s.kiosk_uid = auth.uid() and s.account_id is not null and s.expires_at > now() and s.status <> 'cancelled' then
    select * into a from public.ias_accounts where id = s.account_id;
    r := r || jsonb_build_object(case when s.status = 'done' then 'account' else 'card' end, public.ias_card_json(a));
  end if;
  if s.phone_uid = auth.uid() and s.status = 'captured' and s.expires_at > now() then
    r := r || jsonb_build_object('p', s.p, 'face_desc', to_jsonb(s.face_desc), 'photo', s.photo, 'parent_id', s.parent_id);
  end if;
  return r;
end $$;

create or replace function public.ias_kiosk_claim(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; a public.ias_accounts;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into s from public.ias_kiosk_sessions where id = p_id for update;
  if not found or s.expires_at < now() or s.status in ('done', 'cancelled') then return jsonb_build_object('error', 'expired'); end if;
  if s.phone_uid = auth.uid() then return jsonb_build_object('ok', true); end if;
  if s.phone_uid is not null then return jsonb_build_object('error', 'taken'); end if;
  select * into a from public.ias_accounts where device_uid = auth.uid() and status <> 'invalid';
  if s.kind = 'reg' then
    if found then return jsonb_build_object('error', 'has_account'); end if;
    update public.ias_kiosk_sessions set phone_uid = auth.uid(), status = 'scanned', expires_at = now() + interval '15 minutes' where id = p_id;
  else
    if not found or a.status <> 'active' then return jsonb_build_object('error', 'no_account'); end if;
    if a.version = 'plus' then return jsonb_build_object('error', 'already_plus'); end if;
    update public.ias_kiosk_sessions set phone_uid = auth.uid(), account_id = a.id, minor = age(a.dob) < interval '18 years', status = 'scanned',
      expires_at = now() + interval '15 minutes' where id = p_id;
    insert into public.ias_card_views values (a.id, s.kiosk_uid, now() + interval '15 minutes') on conflict (account_id, uid) do update set expires_at = excluded.expires_at;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ias_kiosk_cancel(p_id uuid) returns void language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions;
begin
  update public.ias_kiosk_sessions set status = 'cancelled', p = null, face_desc = null, photo = null
    where id = p_id and (kiosk_uid = auth.uid() or phone_uid = auth.uid()) and status <> 'done' returning * into s;
  if found then delete from public.ias_card_views where uid = s.kiosk_uid and account_id = s.account_id; end if;
end $$;

-- the kiosk is finished with a card (end of the procedure, exit, time-out)
create or replace function public.ias_kiosk_release() returns void language sql security definer set search_path = public, extensions as
$$ delete from public.ias_card_views where uid = auth.uid() $$;

revoke execute on function public.ias_id_prefix(text, date), public.ias_new_id_no(text, date), public.ias_card_json(public.ias_accounts), public.ias_ack_id(),
  public.ias_may_view_card(text), public.ias_kiosk_card(text), public.ias_kiosk_release() from public, anon, authenticated;
grant execute on function public.ias_ack_id(), public.ias_may_view_card(text), public.ias_kiosk_card(text), public.ias_kiosk_release() to authenticated;
