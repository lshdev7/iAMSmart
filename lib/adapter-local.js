/* iAM Smart – local adapter (IndexedDB in this browser). Same method set as adapter-supabase.js.
   Stores: accounts, profiles, files, requests, logs, inbox, transfers. The device binding is kept in localStorage. */
(function () {
  "use strict";
  var DB = "bhg-iamsmart", VER = 1, dbp = null;
  var CFG = window.IAS_CONFIG || {};

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, bad) {
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () {
        var d = r.result;
        var a = d.createObjectStore("accounts", { keyPath: "id" }); a.createIndex("id_no", "id_no", { unique: false });
        d.createObjectStore("profiles", { keyPath: "account_id" });
        d.createObjectStore("files", { keyPath: "key" });
        var q = d.createObjectStore("requests", { keyPath: "id" }); q.createIndex("code", "code", { unique: false });
        var l = d.createObjectStore("logs", { keyPath: "n", autoIncrement: true }); l.createIndex("account_id", "account_id");
        var b = d.createObjectStore("inbox", { keyPath: "n", autoIncrement: true }); b.createIndex("account_id", "account_id");
        d.createObjectStore("transfers", { keyPath: "code" });
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { bad(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        Promise.resolve(fn(s)).then(function (v) { out = v; });
        t.oncomplete = function () { ok(out); };
        t.onerror = function () { bad(t.error); };
      });
    });
  }
  function req(r) { return new Promise(function (ok, bad) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); }; }); }
  function get(store, key) { return tx(store, "readonly", function (s) { return req(s.get(key)); }); }
  function put(store, val) { return tx(store, "readwrite", function (s) { return req(s.put(val)); }); }
  function del(store, key) { return tx(store, "readwrite", function (s) { return req(s.delete(key)); }); }
  function byIndex(store, idx, val) { return tx(store, "readonly", function (s) { return req(s.index(idx).getAll(val)); }); }
  function all(store) { return tx(store, "readonly", function (s) { return req(s.getAll()); }); }

  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : "x" + Date.now().toString(36) + Math.random().toString(36).slice(2)); }
  function rand(n, chars) { var a = new Uint8Array(n), s = ""; crypto.getRandomValues(a); for (var i = 0; i < n; i++) s += chars[a[i] % chars.length]; return s; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function pbkdf2(pin, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 120000 }, k, 256);
    }).then(hex);
  }
  function sha(text) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(hex); }
  function now() { return new Date().toISOString(); }

  /* ---------------------------------------------------------------- device binding */
  function device() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem("ias-device") || "null"); } catch (e) { d = null; }
    if (!d) { d = { device_id: uuid(), account_id: null }; save(d); }
    return d;
  }
  function save(d) { try { localStorage.setItem("ias-device", JSON.stringify(d)); } catch (e) { /* private mode */ } }

  var A = {
    name: "local",
    deviceId: function () { return device().device_id; },

    /* ---------------------------------------------------------------- accounts */
    register: function (p) {
      // p: {version, id_no, name_en, name_local, sex, dob, email, pin, parent_id, files:{card, face, card_back}, credential_id}
      return A.findByIdNo(p.id_no).then(function (old) {
        // an existing valid account can only be moved with "rebind" (password); an invalid one may be registered again
        if (old && old.status !== "invalid") throw new Error("already_registered");
        var mine = device().account_id;
        var dropOld = Promise.all([old ? A.deleteAccount(old.id) : null, mine ? A.deleteAccount(mine) : null]);
        return dropOld.then(function () {
          var salt = rand(16, "abcdef0123456789");
          return pbkdf2(p.pin, salt).then(function (h) {
            var acc = { id: uuid(), version: p.version || "basic", status: "active", id_no: p.id_no, name_en: p.name_en, name_local: p.name_local || "",
                        sex: p.sex, dob: p.dob, email: p.email || "", email_verified: false, pin_hash: h, pin_salt: salt, pin_fail: 0,
                        parent_id: p.parent_id || null, credential_id: p.credential_id || null, device_id: A.deviceId(),
                        created_at: now(), pin_changed_at: now(), auto_logout: 5, login_method: p.credential_id ? "bio" : "pin" };
            return put("accounts", acc).then(function () {
              return put("profiles", { account_id: acc.id, email: p.email || "", email2: "", mobile: "", home_tel: "", office_tel: "", prefix: "", education: "", marital: "", postal_address: "", residential_address: "", billing_address: "" });
            }).then(function () {
              var jobs = [];
              Object.keys(p.files || {}).forEach(function (k) { if (p.files[k]) jobs.push(put("files", { key: acc.id + "/" + k, blob: p.files[k], at: now() })); });
              return Promise.all(jobs);
            }).then(function () {
              var d = device(); d.account_id = acc.id; save(d);
              return A.log(acc.id, "register", "iAM Smart");
            }).then(function () { return acc; });
          });
        });
      });
    },
    current: function () {
      var d = device();
      if (!d.account_id) return Promise.resolve(null);
      return get("accounts", d.account_id).then(function (a) {
        if (!a || a.device_id !== d.device_id) { d.account_id = null; save(d); return null; }
        return a;
      });
    },
    get: function (id) { return get("accounts", id); },
    findByIdNo: function (idNo) { return byIndex("accounts", "id_no", idNo).then(function (r) { return r[0] || null; }); },
    update: function (id, patch) { return get("accounts", id).then(function (a) { Object.keys(patch).forEach(function (k) { a[k] = patch[k]; }); return put("accounts", a).then(function () { return a; }); }); },
    verifyPin: function (id, pin) {
      return get("accounts", id).then(function (a) {
        if (!a || a.status === "invalid") return { ok: false, invalid: true, remaining: 0 };
        return pbkdf2(pin, a.pin_salt).then(function (h) {
          var max = CFG.pinMaxFail || 10;
          if (h === a.pin_hash) { a.pin_fail = 0; return put("accounts", a).then(function () { return { ok: true, remaining: max }; }); }
          a.pin_fail = (a.pin_fail || 0) + 1;
          if (a.pin_fail >= max) a.status = "invalid";
          return put("accounts", a).then(function () { return { ok: false, invalid: a.status === "invalid", remaining: Math.max(0, max - a.pin_fail) }; });
        });
      });
    },
    setPin: function (id, pin) {
      var salt = rand(16, "abcdef0123456789");
      return pbkdf2(pin, salt).then(function (h) { return A.update(id, { pin_hash: h, pin_salt: salt, pin_fail: 0, pin_changed_at: now() }); });
    },
    parentConsent: function (idNo, pin) {
      return A.findByIdNo(idNo).then(function (a) {
        if (!a || a.status !== "active") return null;
        return A.verifyPin(a.id, pin).then(function (r) { return r.ok ? a.id : null; });
      });
    },
    upgrade: function (id) { return A.update(id, { version: "plus" }); },
    suspend: function (id) { return A.update(id, { status: "suspended", suspended_at: now() }); },
    reactivate: function (id) { return A.update(id, { status: "active", suspended_at: null }); },
    deleteAccount: function (id) {
      return Promise.all([del("accounts", id), del("profiles", id),
        tx("files", "readwrite", function (s) { return req(s.getAllKeys()).then(function (ks) { ks.filter(function (k) { return k.indexOf(id + "/") === 0; }).forEach(function (k) { s.delete(k); }); }); })]).then(function () {
        var d = device(); if (d.account_id === id) { d.account_id = null; save(d); }
      });
    },
    rebind: function (idNo, pin) {
      return A.findByIdNo(idNo).then(function (a) {
        if (!a) return null;
        return A.verifyPin(a.id, pin).then(function (r) {
          if (!r.ok) return null;
          return A.update(a.id, { status: "active", suspended_at: null }).then(function () { return A.bindHere(a.id); })
            .then(function (x) { return A.log(a.id, "rebind", "iAM Smart").then(function () { return x; }); });
        });
      });
    },
    bindHere: function (id) { return A.update(id, { device_id: A.deviceId() }).then(function (a) { var d = device(); d.account_id = id; save(d); return a; }); },
    unbindHere: function () { var d = device(); d.account_id = null; save(d); return Promise.resolve(); },
    createTransfer: function (id) {
      var code = rand(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
      return put("transfers", { code: code, account_id: id, expires_at: Date.now() + 10 * 60000 }).then(function () { return code; });
    },
    claimTransfer: function (code) {
      return get("transfers", String(code || "").toUpperCase()).then(function (t) {
        if (!t || t.expires_at < Date.now()) return null;
        return del("transfers", t.code).then(function () { return A.bindHere(t.account_id); });
      });
    },
    file: function (id, kind) { return get("files", id + "/" + kind).then(function (f) { return f ? f.blob : null; }); },
    putFile: function (id, kind, blob) { return put("files", { key: id + "/" + kind, blob: blob, at: now() }); },

    /* ---------------------------------------------------------------- e-ME profile */
    profile: function (id) { return get("profiles", id); },
    saveProfile: function (id, data) { data.account_id = id; return put("profiles", data); },

    /* ---------------------------------------------------------------- logs and inbox */
    log: function (id, action, client) { return put("logs", { account_id: id, action: action, client: client || "", at: now() }); },
    logs: function (id, days) {
      var since = Date.now() - (days || 90) * 864e5;
      return byIndex("logs", "account_id", id).then(function (r) { return r.filter(function (x) { return Date.parse(x.at) >= since; }).reverse(); });
    },
    notify: function (id, title, body) { return put("inbox", { account_id: id, title: title, body: body, at: now(), read: false }); },
    inbox: function (id) { return byIndex("inbox", "account_id", id).then(function (r) { return r.reverse(); }); },
    markRead: function (n) { return get("inbox", n).then(function (m) { if (m) { m.read = true; return put("inbox", m); } }); },

    /* ---------------------------------------------------------------- requests from online services (login / e-ME / signing) */
    createRequest: function (p) {
      // p: {client, client_name, purpose: "login"|"eme"|"sign", scope: [...], digest}
      var r = { id: uuid(), code: rand(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"), secret: rand(24, "abcdefghijklmnopqrstuvwxyz0123456789"),
                client: p.client, client_name: p.client_name || p.client, purpose: p.purpose || "login", scope: p.scope || [], digest: p.digest || "",
                status: "pending", created_at: now(), expires_at: new Date(Date.now() + (CFG.requestTTL || 90) * 1000).toISOString(), account_id: null, result: null };
      return put("requests", r).then(function () { return { id: r.id, code: r.code, secret: r.secret, expires_at: r.expires_at }; });
    },
    request: function (id) { return get("requests", id).then(function (r) { if (r) delete r.secret; return r; }); },
    requestByCode: function (code) { return byIndex("requests", "code", String(code || "").toUpperCase()).then(function (r) { var x = r.filter(function (q) { return q.status === "pending"; })[0] || null; if (x) delete x.secret; return x; }); },
    decide: function (id, accountId, approve) {
      return get("requests", id).then(function (r) {
        if (!r || r.status !== "pending") return null;
        if (Date.parse(r.expires_at) < Date.now()) { r.status = "expired"; return put("requests", r).then(function () { return r; }); }
        if (!approve) { r.status = "rejected"; r.account_id = accountId; return put("requests", r).then(function () { return r; }); }
        return Promise.all([get("accounts", accountId), get("profiles", accountId)]).then(function (x) {
          var a = x[0], pr = x[1] || {};
          return sha(a.id_no + "|" + r.client).then(function (sub) {
            var res = { sub: sub.slice(0, 32), name_en: a.name_en, version: a.version };
            if (r.purpose === "eme" || r.purpose === "login") {
              (r.scope || []).forEach(function (k) {
                var map = { id_no: a.id_no, name_en: a.name_en, name_local: a.name_local, sex: a.sex, dob: a.dob, email: pr.email || a.email,
                            mobile: pr.mobile, home_tel: pr.home_tel, office_tel: pr.office_tel, prefix: pr.prefix, education: pr.education,
                            marital: pr.marital, postal_address: pr.postal_address, residential_address: pr.residential_address };
                if (k in map) res[k] = map[k] || "";
              });
            }
            if (r.purpose === "sign") {
              return sha(a.id + "|" + r.digest + "|" + now()).then(function (s) {
                res.signature = s; res.signed_at = now(); res.cert = "iAM Smart-Cert " + a.id.slice(0, 8).toUpperCase();
                return res;
              });
            }
            return res;
          }).then(function (res) {
            r.status = "approved"; r.account_id = accountId; r.result = res; r.decided_at = now();
            return put("requests", r).then(function () { return A.log(accountId, r.purpose, r.client_name); }).then(function () { return r; });
          });
        });
      });
    },
    poll: function (id, secret) {
      return get("requests", id).then(function (r) {
        if (!r || r.secret !== secret) return { status: "unknown" };
        if (r.status === "pending" && Date.parse(r.expires_at) < Date.now()) { r.status = "expired"; put("requests", r); }
        return { status: r.status, result: r.status === "approved" ? r.result : null };
      });
    },

    /* ---------------------------------------------------------------- statistics for the website */
    stats: function () {
      return Promise.all([all("accounts"), all("logs")]).then(function (x) { return { regs: x[0].length, uses: x[1].length }; });
    }
  };
  window.IAS_ADAPTERS = window.IAS_ADAPTERS || {};
  window.IAS_ADAPTERS.local = A;
})();
