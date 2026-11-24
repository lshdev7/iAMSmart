alter table public.ias_accounts
  add column if not exists face_desc real[],
  add column if not exists face_verified_at timestamptz;

create or replace function public.ias_face_dist(a real[], b real[]) returns double precision language sql immutable set search_path = public, extensions as
$$ select sqrt(sum((x - y) ^ 2)) from unnest(a, b) as t(x, y) $$;
create or replace function public.ias_desc(p jsonb) returns real[] language sql immutable set search_path = public, extensions as
$$ select case when jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 128 then (select array_agg(x::real order by i) from jsonb_array_elements_text(p) with ordinality as e(x, i)) end $$;

create or replace function public.ias_register(p jsonb) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_desc real[] := public.ias_desc(p->'face_desc');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if v_desc is null then raise exception 'face_required'; end if;
  if exists (select 1 from public.ias_accounts where device_uid = auth.uid() and status <> 'invalid') then raise exception 'device_has_account'; end if;
  if exists (select 1 from public.ias_accounts where status <> 'invalid' and face_desc is not null and public.ias_face_dist(face_desc, v_desc) < 0.5) then
    raise exception 'face_already_registered';
  end if;
  delete from public.ias_accounts where device_uid = auth.uid();
  insert into public.ias_accounts (device_uid, version, id_no, name_en, name_local, sex, dob, email, pin_hash, parent_id, credential_id, login_method,
                                   pob, res_status, nationality, face_desc, face_verified_at)
  values (auth.uid(), 'basic', public.ias_new_id_no(), upper(p->>'name_en'), coalesce(p->>'name_local', ''), p->>'sex', (p->>'dob')::date,
          coalesce(p->>'email', ''), crypt(p->>'pin', gen_salt('bf')), nullif(p->>'parent_id', '')::uuid, p->>'credential_id',
          case when coalesce(p->>'credential_id', '') <> '' then 'bio' else 'pin' end,
          coalesce(nullif(p->>'pob', ''), 'BHG'), coalesce(nullif(p->>'res_status', ''), 'A'), coalesce(nullif(p->>'nationality', ''), 'KOR'), v_desc, now())
  returning id into v_id;
  insert into public.ias_profiles (account_id, email) values (v_id, coalesce(p->>'email', ''));
  insert into public.ias_logs (account_id, action, client) values (v_id, 'register', 'iAM Smart');
  return v_id;
end $$;

create or replace function public.ias_face_check(p_desc jsonb) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts; d double precision; v real[] := public.ias_desc(p_desc);
begin
  select * into a from public.ias_accounts where device_uid = auth.uid() and status <> 'invalid';
  if not found or v is null then return jsonb_build_object('match', false); end if;
  if a.face_desc is null then update public.ias_accounts set face_desc = v, face_verified_at = now() where id = a.id; return jsonb_build_object('match', true, 'enrolled', true); end if;
  d := public.ias_face_dist(a.face_desc, v);
  if d < 0.55 then update public.ias_accounts set face_verified_at = now() where id = a.id; end if;
  insert into public.ias_logs (account_id, action, client) values (a.id, case when d < 0.55 then 'face_ok' else 'face_fail' end, 'iAM Smart');
  return jsonb_build_object('match', d < 0.55, 'distance', round(d::numeric, 3));
end $$;

create or replace function public.ias_upgrade() returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.ias_accounts set version = 'plus'
   where device_uid = auth.uid() and status = 'active' and face_verified_at > now() - interval '5 minutes';
  if not found then raise exception 'face_check_required'; end if;
end $$;

create or replace function public.ias_set_status(p_status text) returns void language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts;
begin
  select * into a from public.ias_accounts where device_uid = auth.uid() and status in ('active', 'suspended');
  if not found or p_status not in ('active', 'suspended') then return; end if;
  if a.status = 'suspended' and p_status = 'active' and (a.face_verified_at is null or a.face_verified_at < now() - interval '5 minutes') then
    raise exception 'face_check_required';
  end if;
  update public.ias_accounts set status = p_status, suspended_at = case when p_status = 'suspended' then now() end where id = a.id;
end $$;

drop function if exists public.ias_rebind(text, text);
create or replace function public.ias_rebind(p_id_no text, p_pin text, p_desc jsonb) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts; v real[] := public.ias_desc(p_desc);
begin
  select * into a from public.ias_accounts where id_no = p_id_no;
  if not found or a.status = 'invalid' then return null; end if;
  if a.pin_hash <> crypt(p_pin, a.pin_hash) or (a.face_desc is not null and (v is null or public.ias_face_dist(a.face_desc, v) >= 0.55)) then
    update public.ias_accounts set pin_fail = pin_fail + 1, status = case when pin_fail + 1 >= 10 then 'invalid' else status end where id = a.id;
    return null;
  end if;
  update public.ias_accounts set device_uid = auth.uid(), status = 'active', suspended_at = null, pin_fail = 0, face_verified_at = now() where id = a.id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'rebind', 'iAM Smart');
  return a.id;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.ias_create_request(text, text, text, text[], text), public.ias_poll(uuid, text), public.ias_stats(),
  public.imm_save_evisa(text, jsonb), public.imm_get_evisa(text, text), public.imm_save_booking(text, text, jsonb),
  public.imm_find_booking(text, text), public.imm_cancel_booking(text, text) to anon, authenticated;
grant execute on function public.ias_register(jsonb), public.ias_verify_pin(uuid, text), public.ias_set_pin(uuid, text), public.ias_parent_consent(text, text),
  public.ias_set_status(text), public.ias_upgrade(), public.ias_my_account(), public.ias_my_documents(), public.ias_face_check(jsonb),
  public.ias_rebind(text, text, jsonb), public.ias_create_transfer(uuid), public.ias_claim_transfer(text), public.ias_request_by_code(text),
  public.ias_request(uuid), public.ias_decide(uuid, boolean) to authenticated;
