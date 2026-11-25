-- Residence status and e-Visa come first; the particulars follow from the e-Visa.
do $$ declare d text := pg_get_functiondef('public.imm_evisa_problem(text, text, text)'::regprocedure); n text;
begin
  n := replace(d, 'if not exists (select 1 from jsonb_array_elements', 'if p_name is not null and not exists (select 1 from jsonb_array_elements');
  if n = d then raise exception 'imm_evisa_problem was not changed'; end if;
  execute n;
end $$;

create or replace function public.ias_check_evisa(p_token text, p_name text, p_dob text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare p text := public.imm_evisa_problem(p_token, p_name, p_dob); e public.imm_evisas; x jsonb;
begin
  if p is not null then return jsonb_build_object('error', p); end if;
  select * into e from public.imm_evisas where qr = p_token;
  x := case when jsonb_array_length(e.rec->'people') = 1 then e.rec->'people'->0 end;
  if p_name is null and x is null then return jsonb_build_object('error', 'evisa_invalid'); end if;
  return jsonb_build_object('ok', true, 'ref', e.ref, 'zh', e.rec->>'zh', 'en', e.rec->>'en', 'mode', e.rec->>'mode', 'until', e.rec->>'until', 'valid', e.rec->>'valid',
    'person', case when x is not null then jsonb_build_object('name', x->>'name', 'local', coalesce(x->>'local', ''), 'dob', x->>'dob') end);
end $$;

alter table public.ias_kiosk_sessions add column if not exists res_status text check (res_status in ('A', 'R', 'U', 'C')), add column if not exists evisa text;

-- kiosk: residence status chosen on the kiosk
create or replace function public.ias_kiosk_res(p_id uuid, p_res text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.ias_kiosk_sessions set res_status = p_res, evisa = null
   where id = p_id and kiosk_uid = auth.uid() and kind = 'reg' and status = 'scanned' and expires_at > now() and p_res in ('A', 'R', 'U', 'C');
  if not found then return jsonb_build_object('error', 'expired'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- phone: e-Visa file of the applicant
create or replace function public.ias_kiosk_evisa(p_id uuid, p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.ias_kiosk_sessions; c jsonb;
begin
  select * into s from public.ias_kiosk_sessions where id = p_id and phone_uid = auth.uid() for update;
  if not found or s.kind <> 'reg' or s.status <> 'scanned' or s.expires_at < now() or coalesce(s.res_status, '') not in ('C', 'U') then return jsonb_build_object('error', 'expired'); end if;
  c := public.ias_check_evisa(p_token, null, null);
  if c ? 'error' then return c; end if;
  if (age((c->'person'->>'dob')::date) < interval '18 years') <> s.minor or age((c->'person'->>'dob')::date) < interval '11 years' then return jsonb_build_object('error', 'evisa_age'); end if;
  update public.ias_kiosk_sessions set evisa = p_token where id = p_id;
  return c;
end $$;

do $$ declare d text; n text;
begin
  d := pg_get_functiondef('public.ias_kiosk_get(uuid)'::regprocedure);
  n := replace(d, '  if s.phone_uid = auth.uid() and s.status = ''captured''', '  if auth.uid() in (s.kiosk_uid, s.phone_uid) and s.kind = ''reg'' and s.status in (''scanned'', ''captured'') and s.expires_at > now() then
    r := r || jsonb_build_object(''res_status'', s.res_status, ''evisa_ok'', s.evisa is not null);
    if s.kiosk_uid = auth.uid() and s.evisa is not null then r := r || jsonb_build_object(''person'', public.ias_check_evisa(s.evisa, null, null)->''person''); end if;
  end if;
  if s.phone_uid = auth.uid() and s.status = ''captured''');
  n := replace(n, '''parent_id'', s.parent_id);', '''parent_id'', s.parent_id, ''evisa_token'', s.evisa);');
  if n not like '%evisa_ok%' or n not like '%evisa_token%' then raise exception 'ias_kiosk_get was not changed'; end if;
  execute n;
  d := pg_get_functiondef('public.ias_kiosk_submit(uuid, jsonb, jsonb, text)'::regprocedure);
  n := replace(d, '    if exists (select 1 from public.ias_accounts where status <> ''invalid'' and face_desc is not null',
    '    if s.res_status is null or p->>''res_status'' is distinct from s.res_status then return jsonb_build_object(''error'', ''bad_particulars''); end if;
    if s.res_status in (''C'', ''U'') and public.imm_evisa_problem(s.evisa, p->>''name_en'', p->>''dob'') is not null then
      return jsonb_build_object(''error'', public.imm_evisa_problem(s.evisa, p->>''name_en'', p->>''dob''));
    end if;
    if exists (select 1 from public.ias_accounts where status <> ''invalid'' and face_desc is not null');
  if n = d then raise exception 'ias_kiosk_submit was not changed'; end if;
  execute n;
  d := pg_get_functiondef('public.ias_kiosk_finish(uuid)'::regprocedure); n := replace(d, 'photo = null, expires_at', 'photo = null, evisa = null, expires_at'); if n = d then raise exception 'finish'; end if; execute n;
  d := pg_get_functiondef('public.ias_kiosk_cancel(uuid)'::regprocedure); n := replace(d, 'photo = null' || chr(10), 'photo = null, evisa = null' || chr(10)); if n = d then raise exception 'cancel'; end if; execute n;
end $$;

revoke execute on function public.ias_kiosk_res(uuid, text), public.ias_kiosk_evisa(uuid, text) from public, anon, authenticated;
grant execute on function public.ias_kiosk_res(uuid, text), public.ias_kiosk_evisa(uuid, text) to authenticated;
