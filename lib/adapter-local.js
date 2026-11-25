/* iAM Smart – local adapter (IndexedDB in this browser). Same method set as adapter-supabase.js.
   Stores: accounts, profiles, files, requests, logs, inbox, transfers. The device binding is kept in localStorage. */
(function () {
  "use strict";
  var DB = "bhg-iamsmart", VER = 2, dbp = null;
  var CFG = window.IAS_CONFIG || {};

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, bad) {
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("kiosk")) d.createObjectStore("kiosk", { keyPath: "id" });
        if (d.objectStoreNames.contains("accounts")) return;
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
  function fdist(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s); }
  function years(dob) { var b = new Date(dob + "T00:00:00"), n = new Date(), y = n.getFullYear() - b.getFullYear(); return n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? y - 1 : y; }
  function recentFace(a) { return a && a.face_verified_at && Date.now() - Date.parse(a.face_verified_at) < 5 * 60000; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  /* ---------------------------------------------------------------- identity card number */
  function idCheck(l, d) {
    var c = function (ch) { return ch.charCodeAt(0) - 55; }, s = l.length === 1 ? 36 * 9 + c(l) * 8 : c(l[0]) * 9 + c(l[1]) * 8;
    for (var i = 0; i < 6; i++) s += (+d[i]) * (7 - i);
    var k = (11 - s % 11) % 11; return k === 10 ? "A" : String(k);
  }
  function idPrefix(pob, dob) {   // births in BHG follow the birth register; everyone else is first registered now
    if (pob !== "BHG" || !dob || dob < "1980-01-01") return "L";
    return dob < "1989-01-01" ? "Z" : dob < "2005-04-01" ? "Y" : dob < "2019-06-01" ? "S" : "N";
  }
  function newIdNo(pob, dob) {
    var l = idPrefix(pob, dob), d = rand(6, "0123456789"), v = l + d + "(" + idCheck(l, d) + ")";
    return A.findByIdNo(v).then(function (x) { return x ? newIdNo(pob, dob) : v; });
  }

  /* ---------------------------------------------------------------- device binding */
  function device() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem("ias-device") || "null"); } catch (e) { d = null; }
    if (!d) { d = { device_id: uuid(), account_id: null }; save(d); }
    return d;
  }
  function save(d) { try { localStorage.setItem("ias-device", JSON.stringify(d)); } catch (e) { /* private mode */ } }

  function cardOf(a) { return { account_id: a.id, id_no: a.id_no, name_en: a.name_en, name_local: a.name_local, sex: a.sex, dob: a.dob, pob: a.pob, nationality: a.nationality, res_status: a.res_status, card_issued_at: a.card_issued_at, created_at: a.created_at, version: a.version }; }

  var A = {
    name: "local",
    ackId: function () { return A.current().then(function (a) { return a && A.update(a.id, { id_ack_at: now() }); }); },
    deviceId: function () { return device().device_id; },

    /* ---------------------------------------------------------------- accounts */
    register: function (p) {
      // p: {name_en, name_local, sex, dob, pob, res_status, nationality, email, pin, parent_id, files:{face}, credential_id}
      // The identity card number is issued here (unique, HKID-style check character).
      if (!p.face_desc || p.face_desc.length !== 128) return Promise.reject(new Error("face_required"));
      return A.current().then(function (mine) {
        if (mine && mine.status !== "invalid") throw new Error("device_has_account");
        return all("accounts").then(function (list) {   // one person, one identity card
          if (list.some(function (x) { return x.status !== "invalid" && x.face_desc && fdist(x.face_desc, p.face_desc) < 0.5; })) throw new Error("face_already_registered");
          return mine;
        });
      }).then(function (mine) {
        return (mine ? A.deleteAccount(mine.id) : Promise.resolve()).then(function () { return newIdNo(p.pob || "BHG", p.dob); });
      }).then(function (idNo) {
        p.id_no = idNo;
        return Promise.resolve().then(function () {
          var salt = rand(16, "abcdef0123456789");
          return pbkdf2(p.pin, salt).then(function (h) {
            var acc = { id: uuid(), version: "basic", status: "active", id_no: p.id_no, name_en: String(p.name_en).toUpperCase(), name_local: p.name_local || "",
                        pob: p.pob || "BHG", res_status: p.res_status || "A", nationality: p.nationality || "KOR", card_issued_at: now(),
                        sex: p.sex, dob: p.dob, email: p.email || "", email_verified: false, pin_hash: h, pin_salt: salt, pin_fail: 0,
                        parent_id: p.parent_id || null, credential_id: p.credential_id || null, device_id: A.deviceId(), face_desc: p.face_desc, face_verified_at: now(),
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
    upgrade: function (id) {
      return A.get(id).then(function (a) { if (!recentFace(a)) throw new Error("face_check_required"); return A.update(id, { version: "plus" }); });
    },
    faceCheck: function (desc) {
      return A.current().then(function (a) {
        if (!a || !desc || desc.length !== 128) return { match: false };
        if (!a.face_desc) return A.update(a.id, { face_desc: desc, face_verified_at: now() }).then(function () { return { match: true, enrolled: true }; });
        var d = fdist(a.face_desc, desc), ok = d < 0.55;
        return (ok ? A.update(a.id, { face_verified_at: now() }) : Promise.resolve()).then(function () { return A.log(a.id, ok ? "face_ok" : "face_fail", "iAM Smart"); })
          .then(function () { return { match: ok, distance: Math.round(d * 1000) / 1000 }; });
      });
    },
    suspend: function (id) { return A.update(id, { status: "suspended", suspended_at: now() }); },
    reactivate: function (id) {
      return A.get(id).then(function (a) { if (!recentFace(a)) throw new Error("face_check_required"); return A.update(id, { status: "active", suspended_at: null }); });
    },
    deleteAccount: function (id) {
      return Promise.all([del("accounts", id), del("profiles", id),
        tx("files", "readwrite", function (s) { return req(s.getAllKeys()).then(function (ks) { ks.filter(function (k) { return k.indexOf(id + "/") === 0; }).forEach(function (k) { s.delete(k); }); }); })]).then(function () {
        var d = device(); if (d.account_id === id) { d.account_id = null; save(d); }
      });
    },
    rebind: function (idNo, pin, desc) {
      return A.findByIdNo(idNo).then(function (a) {
        if (!a) return null;
        return A.verifyPin(a.id, pin).then(function (r) {
          if (!r.ok) return null;
          if (a.face_desc && (!desc || fdist(a.face_desc, desc) >= 0.55)) return null;   // same person as at registration
          return A.update(a.id, { status: "active", suspended_at: null, face_verified_at: now() }).then(function () { return A.bindHere(a.id); })
            .then(function (x) { return A.log(a.id, "rebind", "iAM Smart").then(function () { return x; }); });
        });
      });
    },
    bindHere: function (id) { return A.update(id, { device_id: A.deviceId() }).then(function (a) { var d = device(); d.account_id = id; save(d); return a; }); },
    slots: {   // accounts bound to this browser
      list: function () { return all("accounts").then(function (l) { return l.filter(function (a) { return a.device_id === A.deviceId(); }).map(function (a) { return { key: a.id, id: a.id, name: a.name_en, id_no: a.id_no }; }); }); },
      use: function (key) { var d = device(); d.account_id = key; save(d); return Promise.resolve(); },
      fresh: function () { var d = device(); d.account_id = null; save(d); return Promise.resolve(); },
      label: function () { /* read from the accounts store */ }
    },
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
    requestByCode: function (code) {   // newest request with this code from the last 15 minutes, any status (the app explains expiry)
      var since = Date.now() - 15 * 60000;
      return byIndex("requests", "code", String(code || "").toUpperCase()).then(function (r) {
        var x = r.filter(function (q) { return Date.parse(q.created_at) > since; }).sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); })[0] || null;
        if (x) delete x.secret; return x;
      });
    },
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
                var map = { id_no: a.id_no, name_en: a.name_en, name_local: a.name_local, sex: a.sex, dob: a.dob, pob: a.pob, nationality: a.nationality,
                            res_status: a.res_status, email: pr.email || a.email, email2: pr.email2, mobile: pr.mobile, home_tel: pr.home_tel, office_tel: pr.office_tel,
                            prefix: pr.prefix, education: pr.education, marital: pr.marital, postal_address: pr.postal_address,
                            residential_address: pr.residential_address, billing_address: pr.billing_address };
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

    /* ---------------------------------------------------------------- self-registration kiosk (same rules as supabase/migrations/0006_ias_kiosk.sql) */
    kiosk: {
      create: function (kind, minor) {
        var s = { id: uuid(), code: rand(6, "ABCDEFGHJKMNPQRSTUVWXYZ23456789"), kind: kind, minor: !!minor, status: "waiting", phone: null, account_id: null, parent_id: null,
                  fails: 0, expires_at: new Date(Date.now() + 180000).toISOString() };
        return put("kiosk", s).then(function () { return { id: s.id, code: s.code, expires_at: s.expires_at }; });
      },
      byCode: function (code) {
        return all("kiosk").then(function (l) {
          var x = l.filter(function (s) { return s.code === String(code).toUpperCase() && (s.status === "waiting" || s.status === "scanned") && Date.parse(s.expires_at) > Date.now(); })[0];
          return x ? x.id : null;
        });
      },
      get: function (id) {
        return get("kiosk", id).then(function (s) {
          if (!s) return null;
          var late = Date.parse(s.expires_at) < Date.now(), r = { id: s.id, kind: s.kind, minor: s.minor, scanned: !!s.phone, parent: !!s.parent_id, mine: s.phone === A.deviceId(), expires_at: s.expires_at,
            status: late && /waiting|scanned|captured/.test(s.status) ? "expired" : s.status };
          if (s.status === "captured" && !late) { r.p = s.p; r.face_desc = s.face_desc; r.photo = s.photo; r.parent_id = s.parent_id; }
          if (!s.account_id) return r;
          return get("accounts", s.account_id).then(function (a) {
            if (s.status === "done") r.account = cardOf(a); else r.card = cardOf(a);
            return r;
          });
        });
      },
      claim: function (id) {
        return Promise.all([get("kiosk", id), A.current()]).then(function (x) {
          var s = x[0], a = x[1];
          if (!s || Date.parse(s.expires_at) < Date.now() || s.status === "done" || s.status === "cancelled") return { error: "expired" };
          if (s.phone === A.deviceId()) return { ok: true };
          if (s.phone) return { error: "taken" };
          if (s.kind === "reg") { if (a && a.status !== "invalid") return { error: "has_account" }; }
          else {
            if (!a || a.status !== "active") return { error: "no_account" };
            if (a.version === "plus") return { error: "already_plus" };
            s.account_id = a.id; s.minor = years(a.dob) < 18;
          }
          s.phone = A.deviceId(); s.status = "scanned"; s.expires_at = new Date(Date.now() + 15 * 60000).toISOString();
          return put("kiosk", s).then(function () { return { ok: true }; });
        });
      },
      parent: function (id) {
        return Promise.all([get("kiosk", id), A.current()]).then(function (x) {
          var s = x[0], a = x[1];
          if (!a || a.status !== "active") return { error: "no_account" };
          if (years(a.dob) < 18) return { error: "parent_minor" };
          if (!s || s.status !== "scanned") return { error: "expired" };
          s.parent_id = a.id; return put("kiosk", s).then(function () { return { ok: true }; });
        });
      },
      submit: function (id, p, desc, photo) {
        return Promise.all([get("kiosk", id), all("accounts")]).then(function (x) {
          var s = x[0];
          if (!s || s.status !== "scanned") return { error: "expired" };
          if (!desc || desc.length !== 128) return { error: "face_required" };
          if (s.minor && !s.parent_id) return { error: "parent_required" };
          if (s.kind === "reg") {
            if (x[1].some(function (q) { return q.status !== "invalid" && q.face_desc && fdist(q.face_desc, desc) < 0.5; })) return { error: "face_already_registered" };
            s.status = "captured"; s.p = p; s.face_desc = desc; s.photo = photo;
            return put("kiosk", s).then(function () { return { ok: true }; });
          }
          return get("accounts", s.account_id).then(function (a) {
            if (a.face_desc && fdist(a.face_desc, desc) >= 0.55) return { error: "face_mismatch" };
            return A.update(a.id, { version: "plus", face_desc: a.face_desc || desc, face_verified_at: now() }).then(function () { s.status = "done"; return put("kiosk", s); }).then(function () { return { ok: true }; });
          });
        });
      },
      finish: function (id) {
        return Promise.all([get("kiosk", id), A.current()]).then(function (x) {
          var s = x[0], a = x[1];
          if (!s || s.status !== "captured" || !a || a.name_en !== s.p.name_en || a.dob !== s.p.dob) return { error: "mismatch" };
          return A.update(a.id, { version: "plus", parent_id: s.parent_id }).then(function () {
            s.status = "done"; s.account_id = a.id; s.p = s.face_desc = s.photo = null; return put("kiosk", s);
          }).then(function () { return { ok: true }; });
        });
      },
      cancel: function (id) { return get("kiosk", id).then(function (s) { if (s && s.status !== "done") { s.status = "cancelled"; s.p = s.face_desc = s.photo = null; return put("kiosk", s); } }); },
      card: function (idNo) {
        return A.findByIdNo(idNo).then(function (a) {
          if (!a || !/active|suspended/.test(a.status)) return { error: "unknown" };
          return A.log(a.id, "card_view", "iAM Smart Kiosk").then(function () { return A.notify(a.id, "@mail_card_title", "@mail_card_body"); }).then(function () { return cardOf(a); });
        });
      },
      photo: function (accountId) { return A.file(accountId, "face"); },
      release: function () { return Promise.resolve(); },
      suspend: function (idNo, desc) {
        return A.findByIdNo(idNo).then(function (a) {
          if (!a || !/active|suspended/.test(a.status) || !a.face_desc || fdist(a.face_desc, desc) >= 0.55) return false;
          return A.suspend(a.id).then(function () { return true; });
        });
      }
    },

    /* ---------------------------------------------------------------- records of the Immigration Department / GovBHG (same keys as before) */
    records: {
      saveEvisa: function (rec) { var a = lsGet("bhg-evisa"); a[rec.ref] = rec; lsSet("bhg-evisa", a); return Promise.resolve(); },
      getEvisa: function (ref, dob) {
        var r = lsGet("bhg-evisa")[String(ref).toUpperCase()];
        return Promise.resolve(r && r.people.some(function (p) { return p.dob === dob; }) ? r : null);
      },
      saveBooking: function (ref, code, data) { var a = lsGet("bhg-bookings"); data.code = code; a[ref] = data; lsSet("bhg-bookings", a); return Promise.resolve(); },
      findBooking: function (ref, code) { var b = lsGet("bhg-bookings")[String(ref).toUpperCase()]; return Promise.resolve(b && b.code === code ? b : null); },
      cancelBooking: function (ref, code) {
        var a = lsGet("bhg-bookings"), k = String(ref).toUpperCase(), ok = !!(a[k] && a[k].code === code);
        if (ok) { delete a[k]; lsSet("bhg-bookings", a); }
        return Promise.resolve(ok);
      }
    },
    myDocuments: function () {
      return A.current().then(function (me) {
        if (!me) return [];
        var all = lsGet("bhg-evisa"), norm = function (s) { return String(s || "").toUpperCase().replace(/\s+/g, " "); };
        return Object.keys(all).map(function (k) { return all[k]; }).filter(function (r) {
          return (r.people || []).some(function (p) { return p.dob === me.dob && norm(p.name) === norm(me.name_en); });
        });
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
