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
  function ok(r) {
    if (r.error) {
      var m = r.error.message || "error", k = /device_has_account|face_already_registered|face_required|face_check_required/.exec(m);
      var e = new Error(k ? k[0] : m); e.cause = r.error; throw e;
    }
    return r.data;
  }
  function rpc(fn, args) { return client().rpc(fn, args || {}).then(ok); }
  function asDevice(fn) { return signedIn().then(fn); }
  var COLS = "id,device_uid,version,status,id_no,name_en,name_local,sex,dob,email,email_verified,pin_fail,parent_id,credential_id,login_method,auto_logout,created_at,pin_changed_at,suspended_at,pob,res_status,nationality,card_issued_at";

  var A = {
    name: "supabase",
    deviceId: function () { return "supabase-session"; },

    register: function (p) {
      return asDevice(function () {
        return rpc("ias_register", { p: { name_en: p.name_en, name_local: p.name_local, sex: p.sex, dob: p.dob, email: p.email, pob: p.pob, res_status: p.res_status,
                                          nationality: p.nationality, pin: p.pin, parent_id: p.parent_id || "", credential_id: p.credential_id || "",
                                          face_desc: p.face_desc } }).then(function (id) {
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
    faceCheck: function (desc) { return asDevice(function () { return rpc("ias_face_check", { p_desc: desc }); }); },
    update: function (id, patch) { return asDevice(function () { return client().from("ias_accounts").update(patch).eq("id", id).select(COLS).single().then(ok); }); },
    verifyPin: function (id, pin) { return asDevice(function () { return rpc("ias_verify_pin", { p_account: id, p_pin: pin }); }); },
    setPin: function (id, pin) { return asDevice(function () { return rpc("ias_set_pin", { p_account: id, p_pin: pin }); }); },
    suspend: function () { return asDevice(function () { return rpc("ias_set_status", { p_status: "suspended" }); }).then(function () { return A.current(); }); },
    reactivate: function () { return asDevice(function () { return rpc("ias_set_status", { p_status: "active" }); }).then(function () { return A.current(); }); },
    deleteAccount: function (id) {   // remove the photos first (own folder), then the account (profile, logs, inbox cascade)
      return asDevice(function () {
        var bucket = client().storage.from("ias-files");
        return bucket.list(id).then(function (r) {
          var names = (r.data || []).map(function (f) { return id + "/" + f.name; });
          return names.length ? bucket.remove(names) : null;
        }).then(function () { return client().from("ias_accounts").delete().eq("id", id).then(ok); });
      });
    },
    rebind: function (idNo, pin, desc) { return asDevice(function () { return rpc("ias_rebind", { p_id_no: idNo, p_pin: pin, p_desc: desc || null }).then(function (id) { return id ? A.get(id) : null; }); }); },
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
    stats: function () { return rpc("ias_stats"); },

    /* self-registration kiosk (supabase/migrations/0006_ias_kiosk.sql) */
    kiosk: {
      create: function (kind, minor) { return asDevice(function () { return rpc("ias_kiosk_create", { p_kind: kind, p_minor: !!minor }); }); },
      byCode: function (code) { return asDevice(function () { return rpc("ias_kiosk_by_code", { p_code: code }); }); },
      get: function (id) { return asDevice(function () { return rpc("ias_kiosk_get", { p_id: id }); }); },
      claim: function (id) { return asDevice(function () { return rpc("ias_kiosk_claim", { p_id: id }); }); },
      parent: function (id) { return asDevice(function () { return rpc("ias_kiosk_parent", { p_id: id }); }); },
      submit: function (id, p, desc, photo) { return asDevice(function () { return rpc("ias_kiosk_submit", { p_id: id, p: p || {}, p_desc: desc, p_photo: photo || "" }); }); },
      finish: function (id) { return asDevice(function () { return rpc("ias_kiosk_finish", { p_id: id }); }); },
      cancel: function (id) { return asDevice(function () { return rpc("ias_kiosk_cancel", { p_id: id }); }); },
      suspend: function (idNo, desc) { return asDevice(function () { return rpc("ias_kiosk_suspend", { p_id_no: idNo, p_desc: desc }); }); }
    },

    /* records of the Immigration Department / GovBHG (anonymous web pages can call these) */
    records: {
      saveEvisa: function (rec) { return rpc("imm_save_evisa", { p_ref: rec.ref, p_rec: rec }); },
      getEvisa: function (ref, dob) { return rpc("imm_get_evisa", { p_ref: ref, p_dob: dob }); },
      saveBooking: function (ref, code, data) { return rpc("imm_save_booking", { p_ref: ref, p_code: code, p_data: data }); },
      findBooking: function (ref, code) { return rpc("imm_find_booking", { p_ref: ref, p_code: code }); },
      cancelBooking: function (ref, code) { return rpc("imm_cancel_booking", { p_ref: ref, p_code: code }); }
    },
    myDocuments: function () { return asDevice(function () { return rpc("ias_my_documents"); }); }
  };
  window.IAS_ADAPTERS = window.IAS_ADAPTERS || {};
  window.IAS_ADAPTERS.supabase = A;
})();
