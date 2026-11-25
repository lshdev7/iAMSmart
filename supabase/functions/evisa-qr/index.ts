// e-Visa QR code: signs (token) and verifies (verify).
// BHGIM.EVIS.<base64url reference>.<key id>.<base64url DER ECDSA P-256 signature>
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ALG = { name: "ECDSA", namedCurve: "P-256" }, SIG = { name: "ECDSA", hash: "SHA-256" };
const enc = new TextEncoder(), dec = new TextDecoder();

function b64u(b: Uint8Array) { return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64u(s: string) { const t = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(t + "=".repeat((4 - t.length % 4) % 4)), (c) => c.charCodeAt(0)); }
function toDer(raw: Uint8Array) {
  const int = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let v = [...b.slice(i)]; if (v[0] & 0x80) v = [0, ...v]; return [0x02, v.length, ...v]; };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}
function fromDer(d: Uint8Array) {
  if (d[0] !== 0x30 || d[1] !== d.length - 2) throw new Error("der");
  let p = 2; const out = new Uint8Array(64);
  for (let k = 0; k < 2; k++) {
    if (d[p] !== 0x02) throw new Error("der");
    const n = d[p + 1]; let v = d.slice(p + 2, p + 2 + n); p += 2 + n;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error("der");
    out.set(v, 32 * k + 32 - v.length);
  }
  if (p !== d.length) throw new Error("der");
  return out;
}
async function keyRow(kid?: number) {
  const q = db.from("imm_evisa_keys").select("kid,priv,pub");
  const { data } = kid === undefined ? await q.order("kid", { ascending: false }).limit(1).maybeSingle() : await q.eq("kid", kid).maybeSingle();
  return data;
}
async function signingKey() {
  let row = await keyRow();
  if (!row) {
    const kp = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as CryptoKeyPair;
    await db.from("imm_evisa_keys").insert({ kid: 1, priv: await crypto.subtle.exportKey("jwk", kp.privateKey), pub: await crypto.subtle.exportKey("jwk", kp.publicKey) });
    row = await keyRow();   // the first writer wins
  }
  return row!;
}
const short = (ref: string) => ref.replace(/\(.\)$/, "").replace(/-/g, "");

async function expired(rec: unknown) { const { data } = await db.rpc("imm_evisa_expired", { p_rec: rec }); return data === true; }

async function token(ref: string, dob: string) {
  const { data: e } = await db.from("imm_evisas").select("ref,rec,qr").eq("ref", String(ref || "").toUpperCase()).maybeSingle();
  if (!e || !(e.rec.people || []).some((p: { dob: string }) => p.dob === dob)) return { error: "not_found" };
  if (await expired(e.rec)) return { error: "expired" };   // an expired e-Visa is no longer available
  if (e.qr) return { token: e.qr };
  const k = await signingKey(), key = await crypto.subtle.importKey("jwk", k.priv, ALG, false, ["sign"]);
  const head = "BHGIM.EVIS." + b64u(enc.encode(short(e.ref))) + "." + k.kid;
  const t = head + "." + b64u(toDer(new Uint8Array(await crypto.subtle.sign(SIG, key, enc.encode(head)))));
  await db.from("imm_evisas").update({ qr: t }).eq("ref", e.ref).is("qr", null);
  const { data: now } = await db.from("imm_evisas").select("qr").eq("ref", e.ref).single();
  return { token: now!.qr };
}
async function verify(t: string) {
  const m = /^(BHGIM\.EVIS\.([\w-]{8,40})\.(\d{1,4}))\.([\w-]{80,110})$/.exec(String(t || ""));
  if (!m) return { valid: false };
  const k = await keyRow(+m[3]);
  if (!k) return { valid: false };
  try {
    const pub = await crypto.subtle.importKey("jwk", { ...k.pub, key_ops: ["verify"] }, ALG, false, ["verify"]);
    if (!await crypto.subtle.verify(SIG, pub, fromDer(unb64u(m[4])), enc.encode(m[1]))) return { valid: false };
  } catch (_) { return { valid: false }; }
  const s = /^([A-Z]{4})(\d{7})(\d{2})$/.exec(dec.decode(unb64u(m[2])));
  if (!s) return { valid: false };
  const { data: e } = await db.from("imm_evisas").select("ref,rec,qr").eq("qr", t).maybeSingle();
  if (!e) return { valid: false };
  const r = e.rec;
  return { valid: true, expired: await expired(r), rec: { ref: e.ref, mode: r.mode, k: r.k, zh: r.zh, en: r.en, slip: r.slip, issued: r.issued, valid: r.valid, until: r.until, reuntil: r.reuntil, emp: r.emp, people: (r.people || []).map((p: Record<string, string>) => ({ name: p.name, local: p.local, dob: p.dob })) } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let out: unknown, status = 200;
  try {
    const b = await req.json();
    out = b.action === "token" ? await token(b.ref, b.dob) : b.action === "verify" ? await verify(b.token) : { error: "bad_request" };
  } catch (_) { out = { error: "error" }; status = 500; }
  return new Response(JSON.stringify(out), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
