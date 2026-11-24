/* iAM Smart – Supabase adapter. Same method set as adapter-local.js; uses supabase/schema.sql.
   Requires supabase-js v2 (window.supabase) and IAS_CONFIG.supabase.{url, anonKey}. The app signs in anonymously so
   that the account is bound to this browser ("device"); online services only call the public request functions. */
(function () {
  "use strict";
  var CFG = window.IAS_CONFIG || {}, sb = null, authp = null;

  function client() {
    if (!sb) {
      if (!window.supabase || !CFG.supabase || !CFG.supabase.url) throw new Error("Supabase is not configured (lib/config.js)");
      sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey, { auth: { persistSession: true, storageKey: "ias-sb-auth" } });
    }
    return sb;
  }
  function signedIn() {   // anonymous session = this device
    if (!authp) {
      authp = client().auth.getSession().then(function (r) {
        if (r.data && r.data.session) return r.data.session.user;
        return client().auth.signInAnonymously().then(function (x) { if (x.error) throw x.error; return x.data.user; });
      });
    }
    return authp;
  }
  function ok(r) { if (r.error) { var e = new Error(/already_registered/.test(r.error.message || "") ? "already_registered" : (r.error.message || "error")); e.cause = r.error; throw e; } return r.data; }
  function rpc(fn, args) { return client().rpc(fn, args || {}).then(ok); }
  function asDevice(fn) { return signedIn().then(fn); }
  var COLS = "id,device_uid,version,status,id_no,name_en,name_local,sex,dob,email,email_verified,pin_fail,parent_id,credential_id,login_method,auto_logout,created_at,pin_changed_at,suspended_at";

  var A = {
    name: "supabase",
    deviceId: function () { return "supabase-session"; },

    register: function (p) {
      return asDevice(function () {
        return rpc("ias_register", { p: { version: p.version, id_no: p.id_no, name_en: p.name_en, name_local: p.name_local, sex: p.sex, dob: p.dob, email: p.email,
                                          pin: p.pin, parent_id: p.parent_id || "", credential_id: p.credential_id || "" } }).then(function (id) {
          var jobs = Object.keys(p.files || {}).filter(function (k) { return p.files[k]; }).map(function (k) { return A.putFile(id, k, p.files[k]); });
          return Promise.all(jobs).then(function () { return A.get(id); });
        });
      });
    },
    current: function () {
      return asDevice(function (u) {
        return client().from("ias_accounts").select(COLS).eq("device_uid", u.id).maybeSingle().then(ok);
      });
    },
    get: function (id) { return asDevice(function () { return client().from("ias_accounts").select(COLS).eq("id", id).maybeSingle().then(ok); }); },
    parentConsent: function (idNo, pin) { return asDevice(function () { return rpc("ias_parent_consent", { p_id_no: idNo, p_pin: pin }); }); },
    upgrade: function () { return asDevice(function () { return rpc("ias_upgrade"); }).then(function () { return A.current(); }); },
    update: function (id, patch) { return asDevice(function () { return client().from("ias_accounts").update(patch).eq("id", id).select(COLS).single().then(ok); }); },
    verifyPin: function (id, pin) { return asDevice(function () { return rpc("ias_verify_pin", { p_account: id, p_pin: pin }); }); },
    setPin: function (id, pin) { return asDevice(function () { return rpc("ias_set_pin", { p_account: id, p_pin: pin }); }); },
    suspend: function () { return asDevice(function () { return rpc("ias_set_status", { p_status: "suspended" }); }).then(function () { return A.current(); }); },
    reactivate: function () { return asDevice(function () { return rpc("ias_set_status", { p_status: "active" }); }).then(function () { return A.current(); }); },
    deleteAccount: function (id) { return asDevice(function () { return client().from("ias_accounts").delete().eq("id", id).then(ok); }); },
    rebind: function (idNo, pin) { return asDevice(function () { return rpc("ias_rebind", { p_id_no: idNo, p_pin: pin }).then(function (id) { return id ? A.get(id) : null; }); }); },
    bindHere: function (id) { return A.get(id); },
    unbindHere: function () { return client().auth.signOut().then(function () { authp = null; }); },
    createTransfer: function (id) { return asDevice(function () { return rpc("ias_create_transfer", { p_account: id }); }); },
    claimTransfer: function (code) { return asDevice(function () { return rpc("ias_claim_transfer", { p_code: code }).then(function (id) { return id ? A.get(id) : null; }); }); },
    file: function (id, kind) {
      return asDevice(function () { return client().storage.from("ias-files").download(id + "/" + kind + ".jpg").then(function (r) { return r.error ? null : r.data; }); });
    },
    putFile: function (id, kind, blob) {
      return asDevice(function () { return client().storage.from("ias-files").upload(id + "/" + kind + ".jpg", blob, { upsert: true, contentType: "image/jpeg" }).then(ok); });
    },

    profile: function (id) { return asDevice(function () { return client().from("ias_profiles").select("*").eq("account_id", id).maybeSingle().then(ok); }); },
    saveProfile: function (id, data) { data.account_id = id; data.updated_at = new Date().toISOString(); return asDevice(function () { return client().from("ias_profiles").upsert(data).then(ok); }); },

    log: function () { return Promise.resolve(); },          // logs are written by the database functions
    logs: function (id, days) {
      var since = new Date(Date.now() - (days || 90) * 864e5).toISOString();
      return asDevice(function () { return client().from("ias_logs").select("*").eq("account_id", id).gte("at", since).order("at", { ascending: false }).then(ok); });
    },
    notify: function (id, title, body) { return asDevice(function () { return client().from("ias_inbox").insert({ account_id: id, title: title, body: body }).then(ok); }); },
    inbox: function (id) { return asDevice(function () { return client().from("ias_inbox").select("*").eq("account_id", id).order("at", { ascending: false }).then(ok); }); },
    markRead: function (n) { return asDevice(function () { return client().from("ias_inbox").update({ read: true }).eq("n", n).then(ok); }); },

    createRequest: function (p) { return rpc("ias_create_request", { p_client: p.client, p_client_name: p.client_name || p.client, p_purpose: p.purpose || "login", p_scope: p.scope || [], p_digest: p.digest || "" }); },
    request: function (id) { return asDevice(function () { return rpc("ias_request", { p_id: id }); }); },
    requestByCode: function (code) { return asDevice(function () { return rpc("ias_request_by_code", { p_code: code }); }); },
    decide: function (id, _accountId, approve) { return asDevice(function () { return rpc("ias_decide", { p_id: id, p_approve: !!approve }).then(function () { return A.request(id); }); }); },
    poll: function (id, secret) { return rpc("ias_poll", { p_id: id, p_secret: secret }); },
    stats: function () { return rpc("ias_stats"); }
  };
  window.IAS_ADAPTERS = window.IAS_ADAPTERS || {};
  window.IAS_ADAPTERS.supabase = A;
})();
