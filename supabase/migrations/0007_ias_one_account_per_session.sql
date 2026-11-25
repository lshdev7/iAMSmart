-- One device session holds one account. The app gives every account its own session, so an account can never be
-- moved into a session that already holds another one.
create or replace function public.ias_rebind(p_id_no text, p_pin text, p_desc jsonb) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a public.ias_accounts; v real[] := public.ias_desc(p_desc);
begin
  select * into a from public.ias_accounts where id_no = p_id_no;
  if not found or a.status = 'invalid' then return null; end if;
  if exists (select 1 from public.ias_accounts where device_uid = auth.uid() and id <> a.id) then raise exception 'device_has_account'; end if;
  if a.pin_hash <> crypt(p_pin, a.pin_hash) or (a.face_desc is not null and (v is null or public.ias_face_dist(a.face_desc, v) >= 0.55)) then
    update public.ias_accounts set pin_fail = pin_fail + 1, status = case when pin_fail + 1 >= 10 then 'invalid' else status end where id = a.id;
    return null;
  end if;
  update public.ias_accounts set device_uid = auth.uid(), status = 'active', suspended_at = null, pin_fail = 0, face_verified_at = now() where id = a.id;
  insert into public.ias_logs (account_id, action, client) values (a.id, 'rebind', 'iAM Smart');
  return a.id;
end $$;

create or replace function public.ias_claim_transfer(p_code text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare t public.ias_transfers;
begin
  select * into t from public.ias_transfers where code = upper(p_code) and expires_at > now() for update;
  if not found then return null; end if;
  if exists (select 1 from public.ias_accounts where device_uid = auth.uid() and id <> t.account_id) then raise exception 'device_has_account'; end if;
  delete from public.ias_transfers where code = t.code;
  update public.ias_accounts set device_uid = auth.uid() where id = t.account_id;
  return t.account_id;
end $$;
