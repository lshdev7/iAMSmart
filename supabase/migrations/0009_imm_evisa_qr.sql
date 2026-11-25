-- Signed QR code of the e-Visa: BHGIM.EVIS.<base64url of the reference>.<key id>.<base64url of a DER ECDSA P-256 signature>
-- Signing and verification: Edge Function "evisa-qr" (the key pair is created on first use and is readable by the service role only).
alter table public.imm_evisas add column if not exists qr text;
create table if not exists public.imm_evisa_keys (kid int primary key, priv jsonb not null, pub jsonb not null, created_at timestamptz not null default now());
alter table public.imm_evisa_keys enable row level security;
revoke all on public.imm_evisa_keys from public, anon, authenticated;
create or replace function public.imm_save_evisa(p_ref text, p_rec jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_ref !~ '^[A-Z]{4}-\d{7}-\d{2}\([0-9A-F]\)$' then raise exception 'bad reference'; end if;
  insert into public.imm_evisas (ref, rec) values (p_ref, p_rec);
end $$;
