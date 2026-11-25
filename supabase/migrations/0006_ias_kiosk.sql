-- Self-registration kiosk: a session links the kiosk screen (kiosk_uid) with the applicant's phone (phone_uid).
-- waiting -> scanned (phone linked) -> captured (particulars + face taken at the kiosk) -> done; or cancelled.
create table if not exists public.ias_kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind text not null check (kind in ('reg', 'upgrade')),
  minor boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'scanned', 'captured', 'done', 'cancelled')),
  kiosk_uid uuid not null,
  phone_uid uuid,
  account_id uuid references public.ias_accounts(id) on delete set null,
  parent_id uuid references public.ias_accounts(id) on delete set null,
  p jsonb, face_desc real[], photo text,
  fails int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '180 seconds'
);
create index if not exists ias_kiosk_sessions_code on public.ias_kiosk_sessions (code);
alter table public.ias_kiosk_sessions enable row level security;
revoke all on public.ias_kiosk_sessions from anon, authenticated;   -- only through the functions below

create or replace function public.ias_kiosk_create(p_kind text, p_minor boolean) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v public.ias_kiosk_sessions; c text := ''; i int; ch text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(6);
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.ias_kiosk_sessions where expires_at < now() - interval '2 minutes' or kiosk_uid = auth.uid();
  for i in 0..5 loop c := c || substr(ch, 1 + get_byte(b, i) % length(ch), 1); end loop;
  insert into public.ias_kiosk_sessions (code, kind, minor, kiosk_uid) values (c, p_kind, coalesce(p_minor, false), auth.uid()) returning * into v;
  return jsonb_build_object('id', v.id, 'code', v.code, 'expires_at', v.expires_at);
end $$;

create or replace function public.ias_kiosk_by_code(p_code text) returns uuid language sql stable security definer set search_path = public, extensions as
$$ select id from public.ias_kiosk_sessions where code = upper(p_code) and status in ('waiting', 'scanned') and expires_at > now() order by created_at desc limit 1 $$;

create or replace function public.ias_kiosk_get(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; a public.ias_accounts; r jsonb;
begin
  select * into s from public.ias_kiosk_sessions where id = p_id;
  if not found then return null; end if;
  r := jsonb_build_object('id', s.id, 'kind', s.kind, 'minor', s.minor, 'scanned', s.phone_uid is not null, 'parent', s.parent_id is not null,
                          'mine', s.phone_uid is not distinct from auth.uid(), 'expires_at', s.expires_at,
                          'status', case when s.status in ('waiting', 'scanned', 'captured') and s.expires_at < now() then 'expired' else s.status end);
  if s.kiosk_uid = auth.uid() and s.account_id is not null then
    select * into a from public.ias_accounts where id = s.account_id;
    if s.status = 'done' then
      r := r || jsonb_build_object('account', jsonb_build_object('id_no', a.id_no, 'name_en', a.name_en, 'name_local', a.name_local, 'sex', a.sex, 'dob', a.dob, 'pob', a.pob,
             'nationality', a.nationality, 'res_status', a.res_status, 'card_issued_at', a.card_issued_at, 'created_at', a.created_at, 'version', a.version));
    else   -- "card read" screen: masked number and surname only
      r := r || jsonb_build_object('card', jsonb_build_object('id_no', left(a.id_no, 4) || '***(*)', 'surname', split_part(a.name_en, ',', 1)));
    end if;
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
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ias_kiosk_parent(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; a public.ias_accounts;
begin
  select * into a from public.ias_accounts where device_uid = auth.uid() and status = 'active';
  if not found then return jsonb_build_object('error', 'no_account'); end if;
  if age(a.dob) < interval '18 years' then return jsonb_build_object('error', 'parent_minor'); end if;
  select * into s from public.ias_kiosk_sessions where id = p_id for update;
  if not found or s.expires_at < now() or s.status <> 'scanned' then return jsonb_build_object('error', 'expired'); end if;
  if not s.minor or s.phone_uid = auth.uid() then return jsonb_build_object('error', 'taken'); end if;
  update public.ias_kiosk_sessions set parent_id = a.id where id = p_id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'parent_consent', 'iAM Smart Kiosk');
  return jsonb_build_object('ok', true);
end $$;

-- called by the kiosk after the facial identification
create or replace function public.ias_kiosk_submit(p_id uuid, p jsonb, p_desc jsonb, p_photo text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; a public.ias_accounts; v real[] := public.ias_desc(p_desc); yrs interval;
begin
  select * into s from public.ias_kiosk_sessions where id = p_id and kiosk_uid = auth.uid() for update;
  if not found or s.expires_at < now() or s.status <> 'scanned' then return jsonb_build_object('error', 'expired'); end if;
  if v is null or length(coalesce(p_photo, '')) > 700000 then return jsonb_build_object('error', 'face_required'); end if;
  if s.minor and s.parent_id is null then return jsonb_build_object('error', 'parent_required'); end if;
  if s.kind = 'reg' then
    yrs := age((p->>'dob')::date);
    if coalesce(p->>'name_en', '') !~ '^[A-Z][A-Z ''-]*, [A-Z][A-Z ''-]*$' or p->>'sex' not in ('M', 'F') or yrs < interval '11 years'
       or (yrs < interval '18 years') <> s.minor then return jsonb_build_object('error', 'bad_particulars'); end if;
    if exists (select 1 from public.ias_accounts where status <> 'invalid' and face_desc is not null and public.ias_face_dist(face_desc, v) < 0.5) then
      return jsonb_build_object('error', 'face_already_registered');
    end if;
    update public.ias_kiosk_sessions set status = 'captured', p = ias_kiosk_submit.p, face_desc = v, photo = p_photo where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  if s.fails >= 5 then return jsonb_build_object('error', 'too_many'); end if;
  select * into a from public.ias_accounts where id = s.account_id and device_uid = s.phone_uid and status = 'active';
  if not found then return jsonb_build_object('error', 'expired'); end if;
  if a.face_desc is not null and public.ias_face_dist(a.face_desc, v) >= 0.55 then
    update public.ias_kiosk_sessions set fails = fails + 1 where id = p_id;
    insert into public.ias_logs (account_id, action, client) values (a.id, 'face_fail', 'iAM Smart Kiosk');
    return jsonb_build_object('error', 'face_mismatch');
  end if;
  update public.ias_accounts set version = 'plus', face_desc = coalesce(face_desc, v), face_verified_at = now() where id = a.id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'upgrade', 'iAM Smart Kiosk');
  update public.ias_kiosk_sessions set status = 'done' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- called by the phone after ias_register: the kiosk verified the person, so the account is "iAM Smart+"
create or replace function public.ias_kiosk_finish(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; a public.ias_accounts;
begin
  select * into s from public.ias_kiosk_sessions where id = p_id and phone_uid = auth.uid() for update;
  if not found or s.kind <> 'reg' or s.status <> 'captured' then return jsonb_build_object('error', 'expired'); end if;
  select * into a from public.ias_accounts where device_uid = auth.uid() and status = 'active';
  if not found or a.name_en <> s.p->>'name_en' or a.dob <> (s.p->>'dob')::date or a.sex <> s.p->>'sex'
     or a.face_desc is null or public.ias_face_dist(a.face_desc, s.face_desc) > 0.01 then return jsonb_build_object('error', 'mismatch'); end if;
  update public.ias_accounts set version = 'plus', parent_id = s.parent_id where id = a.id;
  update public.ias_kiosk_sessions set status = 'done', account_id = a.id, p = null, face_desc = null, photo = null, expires_at = now() + interval '5 minutes' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ias_kiosk_cancel(p_id uuid) returns void language sql security definer set search_path = public, extensions as
$$ update public.ias_kiosk_sessions set status = 'cancelled', p = null, face_desc = null, photo = null
    where id = p_id and (kiosk_uid = auth.uid() or phone_uid = auth.uid()) and status <> 'done' $$;

-- suspension at the kiosk without the phone: identity card number + same face. One answer for "unknown" and "other person".
create or replace function public.ias_kiosk_suspend(p_id_no text, p_desc jsonb) returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts; v real[] := public.ias_desc(p_desc);
begin
  if auth.uid() is null or v is null then return false; end if;
  select * into a from public.ias_accounts where id_no = p_id_no and status in ('active', 'suspended');
  if not found or a.face_desc is null then return false; end if;
  if public.ias_face_dist(a.face_desc, v) >= 0.55 then
    insert into public.ias_logs (account_id, action, client) values (a.id, 'face_fail', 'iAM Smart Kiosk');
    return false;
  end if;
  update public.ias_accounts set status = 'suspended', suspended_at = coalesce(suspended_at, now()) where id = a.id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'suspend', 'iAM Smart Kiosk');
  return true;
end $$;

revoke execute on function public.ias_kiosk_create(text, boolean), public.ias_kiosk_by_code(text), public.ias_kiosk_get(uuid), public.ias_kiosk_claim(uuid),
  public.ias_kiosk_parent(uuid), public.ias_kiosk_submit(uuid, jsonb, jsonb, text), public.ias_kiosk_finish(uuid), public.ias_kiosk_cancel(uuid),
  public.ias_kiosk_suspend(text, jsonb) from public, anon;
grant execute on function public.ias_kiosk_create(text, boolean), public.ias_kiosk_by_code(text), public.ias_kiosk_get(uuid), public.ias_kiosk_claim(uuid),
  public.ias_kiosk_parent(uuid), public.ias_kiosk_submit(uuid, jsonb, jsonb, text), public.ias_kiosk_finish(uuid), public.ias_kiosk_cancel(uuid),
  public.ias_kiosk_suspend(text, jsonb) to authenticated;
