/* iAM Smart – Supabase adapter. Same method set as adapter-local.js; uses supabase/schema.sql.
   Requires supabase-js v2 (window.supabase) and IAS_CONFIG.supabase.{url, anonKey}. The app signs in anonymously so
   that the account is bound to this browser ("device"); online services only call the public request functions. */
(function () {
  "use strict";
  var CFG = window.IAS_CONFIG || {}, sb = null, authp = null, clients = {};

  /* Account slots: every account on this browser keeps its own anonymous session (= device identity) under its own
     storage key. The first slot uses the original key, so accounts registered earlier stay logged in. */
  var LS = "ias-slots", mem = null, KEY = "ias-sb-auth";
  function slots() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { s = mem; }
    if (!s || !s.list || !s.list.length) s = { active: KEY, list: [{ key: KEY }] };
    return s;
  }
  function saveSlots(s) { mem = s; try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* private mode */ } }
  function slotOf(s, key) { return s.list.filter(function (x) { return x.key === key; })[0]; }
  function emptySlot(x) { delete x.id; delete x.name; delete x.id_no; }
  var active = slots().active;
  function switchTo(key) {
    var s = slots();
    if (!slotOf(s, key)) s.list.push({ key: key });
    s.active = key; saveSlots(s);
    if (key !== active) { if (sb) sb.auth.stopAutoRefresh(); active = key; sb = null; authp = null; }
    return Promise.resolve();
  }

  function client() {
    if (!sb && clients[active]) { sb = clients[active]; sb.auth.startAutoRefresh(); }
    if (!sb) {
      if (!window.supabase || !CFG.supabase || !CFG.supabase.url) throw new Error("Supabase is not configured (lib/config.js)");
      sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey, { auth: { persistSession: true, storageKey: active } });
      clients[active] = sb;
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
      var m = r.error.message || "error", k = /device_has_account|face_already_registered|face_required|face_check_required|id_changed:[A-Z0-9()]+/.exec(m);
      var e = new Error(k ? k[0] : m); e.cause = r.error; throw e;
    }
    return r.data;
  }
  function rpc(fn, args) { return client().rpc(fn, args || {}).then(ok); }
  function asDevice(fn) { return signedIn().then(fn); }
  var COLS = "id,device_uid,version,status,id_no,name_en,name_local,sex,dob,email,email_verified,pin_fail,parent_id,credential_id,login_method,auto_logout,created_at,pin_changed_at,suspended_at,pob,res_status,nationality,card_issued_at,old_id_no,id_ack_at";

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
      return client().auth.getSession().then(function (r) {
        if (r.error && r.error.name === "AuthRetryableFetchError") throw r.error;
        if (!r.data || !r.data.session) return null;   // logged out: no session is created until it is needed
        return client().from("ias_accounts").select(COLS).eq("device_uid", r.data.session.user.id).maybeSingle().then(ok);
      });
    },
    slots: {
      list: function () { return Promise.resolve(slots().list.filter(function (x) { return x.id; })); },
      use: function (key) { return switchTo(key); },
      fresh: function () {   // log out: continue with a slot that has no account
        var s = slots(), e = s.list.filter(function (x) { return !x.id; })[0];
        return switchTo(e ? e.key : KEY + "-" + Date.now().toString(36));
      },
      label: function (x) {   // x = {id, name, id_no} (masked) of the account in the current slot, or null
        var s = slots(), cur = slotOf(s, active);
        if (!cur) { cur = { key: active }; s.list.push(cur); }
        emptySlot(cur);
        if (x) { s.list.forEach(function (y) { if (y.id === x.id) emptySlot(y); }); cur.id = x.id; cur.name = x.name; cur.id_no = x.id_no; }
        saveSlots(s);
      }
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
    ackId: function () { return asDevice(function () { return rpc("ias_ack_id"); }); },
    unbindHere: function () { return client().auth.signOut({ scope: "local" }).then(function () { authp = null; A.slots.label(null); }); },
    createTransfer: function (id) { return asDevice(function () { return rpc("ias_create_transfer", { p_account: id }); }); },
    claimTransfer: function (code) { return asDevice(function () { return rpc("ias_claim_transfer", { p_code: code }).then(function (id) { return id ? A.get(id) : null; }); }); },
    file: function (id, kind) {
      return asDevice(function () { return client().storage.from("ias-files").download(id + "/" + kind + ".jpg").then(function (r) { return r.error ? null : r.data; }); });
    },
    putFile: function (id, kind, blob) {
      return asDevice(function () { return client().storage.from("ias-files").upload(id + "/" + kind + ".jpg", blob, { upsert: true, contentType: "image/jpeg", cacheControl: "0" }).then(ok); });
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
      card: function (idNo) { return asDevice(function () { return rpc("ias_kiosk_card", { p_id_no: idNo }); }); },
      photo: function (accountId) { return A.file(accountId, "face"); },
      release: function () { return asDevice(function () { return rpc("ias_kiosk_release"); }); },
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
