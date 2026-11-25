-- Non-permanent residents (C, U) must provide a valid e-Visa to register.
-- Expired = the validity for presentation (entry) or the limit of stay has passed
create or replace function public.imm_evisa_expired(p_rec jsonb) returns boolean language sql stable set search_path = public, extensions as
$$ select coalesce(to_date(nullif(p_rec->>'until', ''), 'DD-MM-YYYY') < (now() at time zone 'Asia/Seoul')::date, false)
       or (p_rec->>'mode' = 'entry' and coalesce(to_date(nullif(p_rec->>'valid', ''), 'DD-MM-YYYY') < (now() at time zone 'Asia/Seoul')::date, false)) $$;

alter table public.ias_accounts add column if not exists evisa_ref text;
grant select (evisa_ref) on public.ias_accounts to authenticated;

-- why an e-Visa (text of its QR code) cannot be used to register; null = it can. The code must be one the signing service issued.
create or replace function public.imm_evisa_problem(p_token text, p_name text, p_dob text) returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare e public.imm_evisas; r jsonb;
begin
  if coalesce(p_token, '') = '' then return 'evisa_required'; end if;
  select * into e from public.imm_evisas where qr = p_token;
  if not found then return 'evisa_invalid'; end if;
  r := e.rec;
  if not exists (select 1 from jsonb_array_elements(r->'people') x where x->>'dob' = p_dob
                  and regexp_replace(upper(x->>'name'), '\s+', ' ', 'g') = regexp_replace(upper(p_name), '\s+', ' ', 'g')) then return 'evisa_mismatch'; end if;
  if public.imm_evisa_expired(r) then return 'evisa_expired'; end if;
  if coalesce(r->>'k', '') in ('visit', 'pri', 'prt', 'twn', 'tp', 'fdhvisitor') or upper(coalesce(r->'slip'->>1, '')) in ('VISIT', 'VISITOR', 'BHGSAR TRAVEL PASS')
     or to_date(r->>'until', 'DD-MM-YYYY') - to_date(coalesce(nullif(r->>'from', ''), r->>'issued'), 'DD-MM-YYYY') <= 180 then return 'evisa_type'; end if;
  if exists (select 1 from public.ias_accounts where evisa_ref = e.ref and status <> 'invalid') then return 'evisa_used'; end if;
  return null;
end $$;

create or replace function public.ias_check_evisa(p_token text, p_name text, p_dob text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare p text := public.imm_evisa_problem(p_token, p_name, p_dob); e public.imm_evisas;
begin
  if p is not null then return jsonb_build_object('error', p); end if;
  select * into e from public.imm_evisas where qr = p_token;
  return jsonb_build_object('ok', true, 'ref', e.ref, 'zh', e.rec->>'zh', 'en', e.rec->>'en', 'mode', e.rec->>'mode', 'until', e.rec->>'until', 'valid', e.rec->>'valid');
end $$;

do $$ declare d text := pg_get_functiondef('public.ias_register(jsonb)'::regprocedure); n text;
begin
  n := replace(d, 'delete from public.ias_accounts where device_uid = auth.uid();',
    'if coalesce(nullif(p->>''res_status'', ''''), ''A'') in (''C'', ''U'') then
    v_err := public.imm_evisa_problem(p->>''evisa'', p->>''name_en'', p->>''dob'');
    if v_err is not null then raise exception ''%'', v_err; end if;
    select ref into v_ref from public.imm_evisas where qr = p->>''evisa'';
  end if;
  delete from public.ias_accounts where device_uid = auth.uid();');
  n := replace(n, 'declare v_id uuid;', 'declare v_id uuid; v_err text; v_ref text;');
  n := replace(n, 'face_desc, face_verified_at)', 'face_desc, face_verified_at, evisa_ref)');
  n := replace(n, 'v_desc, now())', 'v_desc, now(), v_ref)');
  if n not like '%v_ref)%' or n not like '%imm_evisa_problem%' or n not like '%evisa_ref)%' or n not like '%v_err text%' then raise exception 'ias_register was not changed as expected'; end if;
  execute n;
end $$;

revoke execute on function public.imm_evisa_expired(jsonb), public.imm_evisa_problem(text, text, text), public.ias_check_evisa(text, text, text) from public, anon, authenticated;
grant execute on function public.imm_evisa_expired(jsonb) to service_role;
grant execute on function public.ias_check_evisa(text, text, text) to authenticated;
