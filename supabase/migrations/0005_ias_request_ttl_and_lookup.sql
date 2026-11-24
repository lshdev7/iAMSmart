alter table public.ias_requests alter column expires_at set default now() + interval '180 seconds';
create or replace function public.ias_request_by_code(p_code text) returns jsonb language sql stable security definer set search_path = public, extensions as
$$ select to_jsonb(r) - 'secret' from public.ias_requests r
    where code = upper(p_code) and created_at > now() - interval '15 minutes'
    order by created_at desc limit 1 $$;
revoke execute on function public.ias_request_by_code(text) from public, anon;
grant execute on function public.ias_request_by_code(text) to authenticated;
