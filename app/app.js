/* "iAM Smart" mobile app (runs in the phone's browser). Hash routes; all data access goes through window.IAS. */
(function () {
  "use strict";
  var I18N = window.IAS_I18N, LANGS = ["en", "ko", "zh-hant", "zh-hans"];
  var lang = (function () {
    var q = /[?&]lang=([\w-]+)/.exec(location.search), s = null;
    try { s = localStorage.getItem("ias-lang"); } catch (e) { s = null; }
    var l = (q && q[1]) || s || (navigator.language || "en").toLowerCase();
    if (l.indexOf("ko") === 0) l = "ko"; else if (l === "zh-hans" || l === "zh-cn" || l === "zh-sg") l = "zh-hans"; else if (l.indexOf("zh") === 0) l = "zh-hant";
    return LANGS.indexOf(l) >= 0 ? l : "en";
  })();
  document.documentElement.lang = lang;
  function T(k, vars) { var s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k; if (vars) Object.keys(vars).forEach(function (v) { s = s.split("{" + v + "}").join(vars[v]); }); return s; }

  var root = document.getElementById("app");
  var ME = null, UNLOCKED = "", PENDING = "", R = null, timer = null, streams = [];

  /* ------------------------------------------------------------------ helpers */
  function el(tag, p, kids) {
    var e = document.createElement(tag); p = p || {};
    Object.keys(p).forEach(function (k) {
      if (k === "text") e.textContent = p[k]; else if (k === "html") e.innerHTML = p[k]; else if (k === "cls") e.className = p[k];
      else if (k === "on") Object.keys(p.on).forEach(function (ev) { e.addEventListener(ev, p.on[ev]); });
      else if (p[k] !== undefined && p[k] !== null && p[k] !== false) e.setAttribute(k, p[k] === true ? "" : p[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function go(h) { location.hash = h; }
  function stopCams() { if (faceRun) { faceRun.stop(); faceRun = null; } streams.forEach(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); }); streams = []; }
  function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function say(text) { if (R && R.voice && window.speechSynthesis) { try { var u = new SpeechSynthesisUtterance(text); u.lang = lang === "ko" ? "ko-KR" : lang.indexOf("zh") === 0 ? "zh-HK" : "en-GB"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voice */ } } }
  function mask(nameEn) {
    var p = String(nameEn || "").split(",");
    var sur = (p[0] || "").trim().toUpperCase(), giv = (p[1] || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
    return sur + (giv.length ? " " + giv.map(function (g) { return g[0] + "**"; }).join(" ") : "");
  }
  function maskId(id) { var m = /^([A-Z]{1,2})(\d{6})\((.)\)$/.exec(id || ""); return m ? m[1] + m[2].slice(0, 3) + "***(*)" : id; }
  function ageOf(dob) { var b = new Date(dob + "T00:00:00"), n = new Date(), a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; }
  function ageGroup(dob) { var a = ageOf(dob); return a < 18 ? "11-17" : a < 65 ? "18-64" : "65+"; }
  var ID_RE = /^([A-Z]{1,2})(\d{6})\(?([0-9A])\)?$/;
  function normId(v) { var m = ID_RE.exec(String(v || "").toUpperCase().replace(/\s/g, "")); return m ? m[1] + m[2] + "(" + m[3] + ")" : null; }
  function validDob(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); if (!m) return false; var d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d < new Date() && +m[1] > 1900; }
  function fmtTime(iso) { var d = new Date(iso); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function qrCanvas(text, size) {
    var q = window.qrcode(0, "M"); q.addData(unescape(encodeURIComponent(text)), "Byte"); q.make();
    var n = q.getModuleCount(), c = el("canvas", { width: size, height: size, cls: "qr" }), x = c.getContext("2d"), m = size / (n + 8);
    x.fillStyle = "#fff"; x.fillRect(0, 0, size, size); x.fillStyle = "#111";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(Math.floor((k + 4) * m), Math.floor((r + 4) * m), Math.ceil(m), Math.ceil(m));
    return c;
  }
  function sha256(s) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }); }
  function toast(msg) { var t = el("div", { cls: "toast", text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

  /* ------------------------------------------------------------------ layout */
  function screen(title, opts) {
    opts = opts || {};
    stopCams(); clearTimer();
    root.innerHTML = "";
    var bar = el("header", { cls: "bar" + (opts.plain ? " plain" : "") });
    if (opts.back) bar.appendChild(el("button", { cls: "back", "aria-label": T("back"), on: { click: function () { if (typeof opts.back === "function") opts.back(); else go(opts.back); } } }, ["‹"]));
    bar.appendChild(el("h1", { text: title }));
    if (opts.lang) {
      var sel = el("select", { cls: "langsel", "aria-label": "Language" });
      [["en", "English"], ["ko", "한국어"], ["zh-hant", "繁體"], ["zh-hans", "简体"]].forEach(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (o[0] === lang) op.selected = true; sel.appendChild(op); });
      sel.addEventListener("change", function () {
        try { localStorage.setItem("ias-lang", sel.value); } catch (e) { /* ignore */ }
        // the address may carry ?lang=… (links from the websites and login requests); replace it so the new choice wins
        var q = location.search.replace(/^\?/, "").split("&").filter(function (x) { return x && !/^lang=/.test(x); });
        q.push("lang=" + encodeURIComponent(sel.value));
        location.replace(location.pathname + "?" + q.join("&") + location.hash);
      });
      bar.appendChild(sel);
    }
    root.appendChild(bar);
    var main = el("main", { cls: "body" });
    root.appendChild(main);
    if (opts.nav) root.appendChild(navbar(opts.nav));
    return main;
  }
  function navbar(on) {
    var items = [["home", "🏠"], ["services", "🗂"], ["scan", "⌗"], ["inbox", "✉"], ["me", "👤"]];
    return el("nav", { cls: "tabs" }, items.map(function (it) {
      return el("a", { href: "#/" + it[0], cls: on === it[0] ? "on" : "" }, [el("span", { cls: "ti", text: it[1] }), el("span", { text: T("nav_" + it[0]) })]);
    }));
  }
  function steps(main, n, total) { main.appendChild(el("div", { cls: "stepper" }, [el("div", { cls: "sbar" }, [el("i", { style: "width:" + Math.round(n / total * 100) + "%" })]), el("span", { text: T("step_of", { n: n, t: total }) })])); }
  function btn(text, fn, cls) { return el("button", { type: "button", cls: "btn " + (cls || ""), text: text, on: { click: fn } }); }
  function field(label, input, hint) { return el("label", { cls: "fld" }, [el("span", { text: label }), input, hint ? el("small", { text: hint }) : null]); }
  function errBox() { return el("p", { cls: "err", role: "alert" }); }

  /* ------------------------------------------------------------------ PIN pad */
  function pinPad(host, onDone, opts) {
    opts = opts || {};
    var v = "", dots = el("div", { cls: "dots" }), err = errBox();
    function draw() { dots.innerHTML = ""; for (var i = 0; i < 6; i++) dots.appendChild(el("i", { cls: i < v.length ? "on" : "" })); }
    var pad = el("div", { cls: "pad" });
    "123456789C0⌫".split("").forEach(function (k) {
      pad.appendChild(el("button", { type: "button", cls: "key", text: k === "C" ? "" : k, disabled: k === "C", on: { click: function () {
        if (k === "⌫") v = v.slice(0, -1); else if (v.length < 6) v += k;
        draw();
        if (v.length === 6) { var got = v; v = ""; setTimeout(function () { draw(); onDone(got, err); }, 120); }
      } } }));
    });
    draw();
    host.appendChild(el("div", { cls: "pinwrap" }, [opts.label ? el("p", { cls: "pinlab", text: opts.label }) : null, dots, err, pad]));
    return err;
  }
  function weakPin(p) { return /^(\d)\1{5}$/.test(p) || "0123456789".indexOf(p) >= 0 || "9876543210".indexOf(p) >= 0; }

  /* ------------------------------------------------------------------ camera capture (card / face) */
  function camera(main, facing, overlay, onShot, opts) {
    opts = opts || {};
    var wrap = el("div", { cls: "cam " + overlay }), video = el("video", { playsinline: true, autoplay: true, muted: true }), err = errBox();
    wrap.appendChild(video); wrap.appendChild(el("div", { cls: "frame" }));
    var tip = el("p", { cls: "camtip", text: opts.tip || "" });
    main.appendChild(wrap); main.appendChild(tip); main.appendChild(err);
    var file = el("input", { type: "file", accept: "image/*", capture: facing === "user" ? "user" : "environment", hidden: true });
    file.addEventListener("change", function () { if (file.files[0]) onShot(file.files[0]); });
    var shoot = btn(opts.shootText || T("capture"), function () {
      if (!video.videoWidth) { file.click(); return; }
      var c = el("canvas", { width: video.videoWidth, height: video.videoHeight });
      var x = c.getContext("2d"); if (facing === "user") { x.translate(c.width, 0); x.scale(-1, 1); }
      x.drawImage(video, 0, 0); c.toBlob(function (b) { onShot(b, c); }, "image/jpeg", 0.85);
    });
    main.appendChild(el("div", { cls: "row" }, [btn(T("choose_photo"), function () { file.click(); }, "sec"), shoot, file]));
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false }).then(function (s) {
        streams.push(s); video.srcObject = s; if (facing === "user") video.classList.add("mirror");
      }).catch(function () { err.textContent = T("cam_unavailable"); });
    } else err.textContent = T("cam_unavailable");
    return { video: video, tip: tip };
  }


  /* ------------------------------------------------------------------ live facial identification (no photo files) */
  var FACE_STEPS = ["front", "left", "right", "final"], faceRun = null;
  function faceStep(main, onDone) {
    var wrap = el("div", { cls: "cam face live" }), video = el("video", { playsinline: true, autoplay: true, muted: true, cls: "mirror" });
    wrap.appendChild(video); wrap.appendChild(el("div", { cls: "frame" }));
    var list = el("ol", { cls: "fsteps" }, FACE_STEPS.slice(0, 3).map(function (k) { return el("li", { text: T("fstep_" + k) }); }));
    var tip = el("p", { cls: "camtip", text: T("face_loading") }), err = errBox(), again = el("div");
    [wrap, tip, list, err, again].forEach(function (x) { main.appendChild(x); });
    var last = "";
    function fail(key) {
      stopCams(); err.textContent = T(key); again.innerHTML = "";
      again.appendChild(btn(T("face_retry"), function () { again.innerHTML = ""; err.textContent = ""; start(); }, "big"));
    }
    function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail("face_need_camera"); return; }
      tip.textContent = T("face_loading");
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false }).then(function (s) {
        streams.push(s); video.srcObject = s;
        return window.IASFace.load();
      }).then(function () {
        faceRun = window.IASFace.run(video, function (step, hint) {
          var idx = FACE_STEPS.indexOf(step);
          Array.prototype.forEach.call(list.children, function (li, i) { li.className = i < idx ? "done" : i === idx ? "on" : ""; });
          var msg = hint !== "ok" ? T("fhint_" + hint) : T("fdo_" + step);
          if (msg !== last) { tip.textContent = msg; if (hint === "ok") say(msg); last = msg; }
        });
        return faceRun.done;
      }).then(function (res) {
        faceRun = null; stopCams();
        Array.prototype.forEach.call(list.children, function (li) { li.className = "done"; });
        tip.textContent = T("face_ok");
        onDone(res, fail);
      }, function (e) {
        faceRun = null;
        if (e && e.message === "stopped") return;
        fail(e && e.message === "timeout" ? "face_timeout" : (e && /NotAllowed|NotFound|Permission/i.test(e.name + e.message)) ? "face_need_camera" : "face_error");
      });
    }
    start();
  }

  /* ------------------------------------------------------------------ boot / routing */
  var ACT = 0;
  ["click", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { ACT = Date.now(); }, true); });
  setInterval(function () {
    if (UNLOCKED && ME && Date.now() - ACT > (ME.auto_logout || 5) * 60000) { relock(); toast(T("auto_logged_out")); route(); }
  }, 15000);

  /* UNLOCKED holds the id of the account that was authenticated in this tab, so it never opens another account */
  function unlocked(id) { UNLOCKED = id; ACT = Date.now(); try { sessionStorage.setItem("ias-unlock", id); } catch (e) { /* ignore */ } }
  function relock() { UNLOCKED = ""; try { sessionStorage.removeItem("ias-unlock"); } catch (e) { /* ignore */ } }
  function refreshMe() {
    return IAS.current().then(function (a) { ME = a; IAS.slots.label(a ? { id: a.id, name: mask(a.name_en), id_no: maskId(a.id_no) } : null); return a; });
  }
  function leave(to) {   // log out of this account; it stays on this device and can be chosen again
    relock(); R = null;
    return IAS.slots.fresh().then(function () { ME = null; if (location.hash.replace(/^#/, "") === to) route(); else go(to); });
  }
  function otherAccount(m) {   // keeps the request of an online service, if there is one
    m.appendChild(btn(T("other_account"), function () { var h = location.hash.replace(/^#/, ""); leave(/^\/(auth|kiosk)\//.test(h) ? h : "/"); }, "link"));
  }
  function accountList(m) {   // accounts on this device, log in, register
    var box = el("div", {}), reg = btn(T("register_now"), function () { go("/reg"); }, "big"), log = btn(T("signin_first"), function () { go("/signin"); }, "sec big");
    [box, reg, log].forEach(function (x) { m.appendChild(x); });
    IAS.slots.list().then(function (l) {
      if (!l.length) return;
      log.textContent = T("signin"); log.className = "btn big"; reg.className = "btn sec big"; m.insertBefore(log, reg);
      box.appendChild(el("h2", { text: T("choose_account") }));
      box.appendChild(el("ul", { cls: "menu accts" }, l.map(function (x) {
        return el("li", {}, [el("a", { href: "#", role: "button", on: { click: function (ev) {
          ev.preventDefault(); relock();
          IAS.slots.use(x.key).then(refreshMe).then(function (me) { if (!me) toast(T("account_moved")); route(); });
        } } }, [el("b", { text: mask(x.name) }), el("small", { text: maskId(x.id_no) })])]);
      })));
    });
  }
  function signedIn() { var p = PENDING; PENDING = ""; go(p ? "/auth/" + p : "/home"); }
  function route() {
    var h = location.hash.replace(/^#\/?/, "") || "";
    var parts = h.split("/"), page = parts[0], arg = parts.slice(1).join("/");
    var q = /[?&]req=([\w-]+)/.exec(location.search);
    if (q && !page) { history.replaceState(null, "", location.pathname + "#/auth/" + q[1]); page = "auth"; arg = q[1]; }
    refreshMe().then(function (me) {
      var open = ["reg", "rebind", "signin", "kiosk", "welcome"];
      if (me && (page === "rebind" || page === "signin")) return leave("/" + page);   // another account gets its own slot
      if (!me) { if (open.indexOf(page) < 0) return page === "auth" ? noAccount(arg) : welcome(); return PAGES[page](arg); }
      if (me.status === "invalid") return invalid();
      if (me.status === "suspended" && page !== "reactivate") return suspended();
      if (UNLOCKED !== me.id && page !== "reactivate") return lock(function () { route(); });
      if (me.old_id_no && !me.id_ack_at && UNLOCKED === me.id) return idChanged();
      (PAGES[page] || PAGES.home)(arg);
    });
  }
  window.addEventListener("hashchange", route);
  try { UNLOCKED = sessionStorage.getItem("ias-unlock") || ""; ACT = Date.now(); } catch (e) { /* ignore */ }

  /* ------------------------------------------------------------------ welcome, lock */
  function welcome() {
    var m = screen("", { plain: true, lang: true });
    m.appendChild(el("div", { cls: "hero" }, [el("img", { src: "../assets/logo.svg", alt: "iAM Smart", cls: "biglogo" }), el("p", { text: T("tagline") })]));
    PENDING = "";
    accountList(m);
    m.appendChild(btn(T("reg_kiosk"), function () { go("/kiosk"); }, "sec big"));
    m.appendChild(btn(T("rebind"), function () { go("/rebind"); }, "link"));
  }
  function noAccount(reqId) {
    var m = screen(T("app_name"), { lang: true });
    m.appendChild(el("p", { cls: "lead", text: T("need_account") }));
    PENDING = reqId || "";
    accountList(m);
    m.appendChild(btn(T("rebind"), function () { go("/rebind"); }, "link"));
  }
  function unlockWith(cb) { unlocked(ME.id); IAS.log(ME.id, "login", "iAM Smart").then(cb); }
  function lock(cb) {
    var m = screen(T("app_name"), { lang: true, plain: true });
    m.appendChild(el("div", { cls: "hero small" }, [el("img", { src: "../assets/logo.svg", alt: "iAM Smart", cls: "biglogo" }), el("p", { cls: "hello", text: T("hello", { name: mask(ME.name_en) }) })]));
    var err = errBox();
    if (ME.credential_id && ME.login_method === "bio") {
      m.appendChild(btn(T("login_bio"), function () {
        IAS.bio.verify(ME.credential_id).then(function () { unlockWith(cb); }, function () { err.textContent = T("bio_failed"); });
      }, "big"));
      m.appendChild(err);
      m.appendChild(el("p", { cls: "or", text: T("or_pin") }));
    }
    pinPad(m, function (pin, e2) {
      IAS.verifyPin(ME.id, pin).then(function (r) {
        if (r.ok) { IAS.notify(ME.id, T("mail_pin_title"), T("mail_pin_body", { t: fmtTime(new Date().toISOString()) })); return unlockWith(cb); }
        if (r.invalid) return invalid();
        e2.textContent = T("pin_wrong", { n: r.remaining });
      });
    }, { label: T("enter_pin") });
    m.appendChild(btn(T("forgot_pin"), function () { go("/rebind"); }, "link"));
    otherAccount(m);
  }
  function idChanged() {   // the number was changed: shown once after login, then only the new number is accepted
    var m = screen(T("idchg_title"), { plain: true, lang: true });
    m.appendChild(el("p", { cls: "lead", text: T("idchg_lead") }));
    m.appendChild(el("dl", { cls: "kv" }, [el("dt", { text: T("idchg_old") }), el("dd", {}, [el("s", { text: ME.old_id_no })]), el("dt", { text: T("idchg_new") }), el("dd", {}, [el("b", { text: ME.id_no })])]));
    var holder = el("div", { cls: "idcard" }); m.appendChild(holder);
    m.appendChild(el("h2", { text: T("idchg_todo") }));
    m.appendChild(el("ol", { cls: "todo" }, ["idchg_1", "idchg_2", "idchg_3"].map(function (k) { return el("li", { text: T(k) }); })));
    var pdf = btn(T("download_pdf"), function () { window.BHGIdCardPDF(cardVals(), photo); }, "sec big"), photo = null; pdf.disabled = true; m.appendChild(pdf);
    IAS.file(ME.id, "face").then(function (b) {
      photo = b; if (!b || !window.BHGIdCardImages) return null;
      return window.BHGIdCardImages(cardVals(), b).then(function (c) { c.front.className = "cardimg"; holder.appendChild(c.front); pdf.disabled = false; });
    }).catch(function () { /* the number itself is shown above */ });
    var cb = el("input", { type: "checkbox" }), err = errBox();
    m.appendChild(el("label", { cls: "chk" }, [cb, el("span", { text: T("idchg_agree") })])); m.appendChild(err);
    m.appendChild(btn(T("confirm"), function () {
      if (!cb.checked) { err.textContent = T("err_agree"); return; }
      var b = this; b.disabled = true;
      IAS.ackId().then(function () { toast(T("idchg_ok")); route(); }, function () { b.disabled = false; err.textContent = T("load_failed"); });
    }, "big"));
  }
  function invalid() {
    var m = screen(T("app_name"), { plain: true });
    m.appendChild(el("div", { cls: "notice bad" }, [el("h2", { text: T("invalid_title") }), el("p", { text: T("invalid_body") })]));
    m.appendChild(btn(T("register_now"), function () { IAS.unbindHere().then(function () { go("/reg"); }); }, "big"));
    otherAccount(m);
  }
  function suspended() {
    var m = screen(T("app_name"), { plain: true });
    m.appendChild(el("div", { cls: "notice" }, [el("h2", { text: T("suspended_title") }), el("p", { text: T("suspended_body") })]));
    m.appendChild(btn(T("reactivate"), function () { go("/reactivate"); }, "big"));
    otherAccount(m);
  }

  /* ------------------------------------------------------------------ registration */
  var TOTAL = 10;
  function needEvisa(res) { return res === "C" || res === "U"; }
  /* file -> QR code -> checked by the Immigration Department's records; done(result, token) when it is valid */
  function evisaPanel(m, done) {
    m.appendChild(el("p", { cls: "lead", text: T("evisa_lead") }));
    m.appendChild(el("ul", { cls: "todo" }, ["evisa_n1", "evisa_n2", "evisa_n3"].map(function (k) { return el("li", { text: T(k) }); })));
    var inp = el("input", { type: "file", accept: "application/pdf,image/jpeg,image/gif,image/png" }), box = el("div", {}), run = 0, chosen = null;
    m.appendChild(field(T("evisa_file"), inp)); m.appendChild(box);
    var next = btn(T("next"), function () { if (chosen) done(chosen, chosen.token); }, "big"); next.disabled = true; m.appendChild(next);
    function bad(k) { box.innerHTML = ""; box.appendChild(el("div", { cls: "notice bad" }, [el("p", { text: T(k) })])); }
    function good(r) {
      chosen = r; next.disabled = false; box.innerHTML = "";
      box.appendChild(el("div", { cls: "notice ok" }, [el("div", { cls: "tick", text: "✓" }), el("h2", { text: T("evisa_ok") })]));
      box.appendChild(el("dl", { cls: "kv" }, [el("dt", { text: T("name_en") }), el("dd", { text: r.person.name }), el("dt", { text: T("dob") }), el("dd", { text: r.person.dob.replace(/-/g, "") }), el("dt", { text: T("evisa_ref") }), el("dd", { text: r.ref }),
        el("dt", { text: T("evisa_scheme") }), el("dd", { text: lang.indexOf("zh") === 0 ? r.zh : r.en }), el("dt", { text: T("evisa_until") }), el("dd", { text: r.until })]));
    }
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0], me = ++run; chosen = null; next.disabled = true; box.innerHTML = "";
      if (!f) return;
      box.appendChild(el("p", { cls: "hint", text: T("evisa_reading") }));
      var read = window.BHGEVisaRead ? window.BHGEVisaRead.file(f).catch(function () { return []; }) : Promise.resolve([]);
      read.then(function (l) {
        if (me !== run) return null;
        if (!l.length) { bad("evisa_none"); return null; }
        if (l.every(function (t) { return /^BHG-EVISA\|/.test(t); })) { bad("evisa_old"); return null; }
        return Promise.all(l.map(function (t) { return IAS.checkEvisa(t, null, null).then(function (x) { x.token = t; return x; }); })).then(function (rs) {
          if (me !== run) return;
          var ok = rs.filter(function (x) { return x.ok; });
          if (!ok.length) { bad((rs.filter(function (x) { return x.error !== "evisa_invalid"; })[0] || rs[0]).error); return; }
          if (ok.length === 1) { good(ok[0]); return; }
          box.innerHTML = ""; box.appendChild(el("h2", { text: T("evisa_who") }));   // the e-Visas of a family in one file
          box.appendChild(el("ul", { cls: "menu" }, ok.map(function (x) { return el("li", {}, [el("a", { href: "#", role: "button", text: x.person.name, on: { click: function (ev) { ev.preventDefault(); good(x); } } })]); })));
        });
      }).catch(function () { if (me === run) bad("load_failed"); });
    });
  }
  function regStart() { R = { age: null, voice: false, files: {}, data: {} }; }
  var REG = {
    res: function () {   // residence status first; C and U go to the e-Visa at once
      regStart();
      var m = screen(T("reg_title"), { back: "/" }); steps(m, 1, TOTAL);
      m.appendChild(el("h2", { text: T("res_title") }));
      ["A", "R", "U", "C"].forEach(function (k) {
        var b = btn(T("res_" + k), function () { R.data = { res_status: k }; regGo(needEvisa(k) ? "evisa" : "age"); }, "big sec");
        if (needEvisa(k)) b.appendChild(el("small", { cls: "need", text: T("res_need") }));
        m.appendChild(b);
      });
    },
    age: function () {
      var m = screen(T("reg_title"), { back: function () { regGo(needEvisa(R.data.res_status) ? "evisa" : "res"); } }); steps(m, 2, TOTAL);
      m.appendChild(el("h2", { text: T("choose_age") }));
      var err = errBox();
      function pick(age, to) {   // the date of birth of the e-Visa decides
        var a = R.person ? ageOf(R.person.dob) : null;
        if (a !== null && a < 11) { err.textContent = T("err_age11"); return; }
        if (a !== null && (a < 18) !== (age === "minor")) { err.textContent = T(age === "minor" ? "err_minor" : "err_adult"); return; }
        R.age = age; regGo(to);
      }
      m.appendChild(btn(T("adult"), function () { pick("adult", "decl"); }, "big"));
      m.appendChild(btn(T("minor"), function () { pick("minor", "parent"); }, "big sec"));
      m.appendChild(err);
    },
    parent: function () {
      var m = screen(T("parent_title"), { back: function () { regGo("age"); } }); steps(m, 2, TOTAL);
      m.appendChild(el("p", { cls: "lead", text: T("parent_lead") }));
      var code = Math.random().toString(36).slice(2, 8).toUpperCase();
      m.appendChild(el("div", { cls: "qrbox" }, [qrCanvas("IASPARENT|" + code, 200), el("p", { cls: "code", text: code })]));
      m.appendChild(el("p", { cls: "hint", text: T("parent_here") }));
      var pid = el("input", { type: "text", placeholder: "A123456(7)", autocomplete: "off" }), err = errBox();
      m.appendChild(field(T("parent_id"), pid));
      m.appendChild(err);
      pinPad(m, function (pin, e2) {
        var id = normId(pid.value);
        if (!id) { err.textContent = T("err_id"); return; }
        IAS.parentConsent(id, pin).then(function (pid) {
          if (!pid) { e2.textContent = T("parent_bad"); return; }
          R.parent_id = pid; toast(T("parent_ok")); regGo("decl");
        });
      }, { label: T("parent_pin") });
    },
    decl: function () {
      var m = screen(T("declaration"), { back: function () { regGo("age"); } }); steps(m, 3, TOTAL);
      m.appendChild(el("div", { cls: "scroll", html: T("declaration_html") }));
      var cb = el("input", { type: "checkbox" }), err = errBox();
      m.appendChild(el("label", { cls: "chk" }, [cb, el("span", { text: T("agree") })]));
      m.appendChild(err);
      m.appendChild(btn(T("start"), function () { if (!cb.checked) { err.textContent = T("err_agree"); return; } regGo("voice"); }, "big"));
    },
    voice: function () {
      var m = screen(T("voice_title"), { back: function () { regGo("decl"); } }); steps(m, 4, TOTAL);
      m.appendChild(el("p", { cls: "lead", text: T("voice_lead") }));
      m.appendChild(btn(T("voice_on"), function () { R.voice = true; regGo("info"); }, "big"));
      m.appendChild(btn(T("voice_off"), function () { R.voice = false; regGo("info"); }, "big sec"));
    },
    info: function () {   // personal particulars; the identity card number is issued after registration
      var m = screen(T("info_title"), { back: function () { regGo("voice"); } }); steps(m, 5, TOTAL);
      m.appendChild(el("p", { cls: "lead", text: T("info_lead") }));
      if (R.person) m.appendChild(el("p", { cls: "hint", text: T("evisa_filled") }));
      var d = R.data;
      var sur = el("input", { type: "text", value: d.sur || "", placeholder: "CHOI", autocomplete: "family-name" });
      var giv = el("input", { type: "text", value: d.giv || "", placeholder: "Yu Na", autocomplete: "given-name" });
      var loc = el("input", { type: "text", value: d.name_local || "", autocomplete: "off" });
      var sex = el("select", {}, [el("option", { value: "", text: T("choose") }), el("option", { value: "M", text: T("male") }), el("option", { value: "F", text: T("female") })]); sex.value = d.sex || "";
      var dob = el("input", { type: "text", inputmode: "numeric", autocomplete: "bday", placeholder: "YYYYMMDD", value: (d.dob || "").replace(/-/g, "") });   // typed as YYYYMMDD, kept as YYYY-MM-DD
      function digits() { return dob.value.replace(/\D/g, "").slice(0, 8); }
      function dobIso() { var x = digits(); return x.length === 8 ? x.slice(0, 4) + "-" + x.slice(4, 6) + "-" + x.slice(6) : ""; }
      dob.addEventListener("input", function () { var x = digits(); if (dob.value !== x) dob.value = x; });
      var pob = el("select", {}, [el("option", { value: "BHG", text: T("pob_bhg") }), el("option", { value: "KR", text: T("pob_kr") }), el("option", { value: "XX", text: T("pob_other") })]); pob.value = d.pob || "BHG";
      var nat = el("select", {}, [el("option", { value: "KOR", text: T("nat_kor") }), el("option", { value: "OTH", text: T("nat_other") })]); nat.value = d.nationality || "KOR";
      if (R.person) { [sur, giv, dob].forEach(function (x) { x.readOnly = true; }); loc.readOnly = !!R.person.local; }   // as on the e-Visa
      var err = errBox();
      [field(T("surname"), sur), field(T("given"), giv), field(T("name_local"), loc), field(T("sex"), sex), field(T("dob") + " (YYYYMMDD)", dob),
       field(T("pob"), pob), field(T("nationality"), nat)].forEach(function (f) { m.appendChild(f); });
      m.appendChild(err);
      m.appendChild(btn(T("next"), function () {
        if (!R.person) dob.value = digits();
        if (!/^[A-Za-z][A-Za-z '\-]*$/.test(sur.value.trim()) || !/^[A-Za-z][A-Za-z '\-]*$/.test(giv.value.trim())) { err.textContent = T("err_name"); return; }
        if (!sex.value) { err.textContent = T("err_sex"); return; }
        if (!validDob(dobIso())) { err.textContent = T("err_dob"); return; }
        var a = ageOf(dobIso());
        if (a < 11) { err.textContent = T("err_age11"); return; }
        if (R.age === "adult" && a < 18) { err.textContent = T("err_adult"); return; }
        if (R.age === "minor" && a >= 18) { err.textContent = T("err_minor"); return; }
        R.data = { sur: sur.value.trim(), giv: giv.value.trim(), name_local: loc.value.trim(), sex: sex.value, dob: dobIso(), pob: pob.value,
                   nationality: nat.value, res_status: d.res_status, name_en: sur.value.trim().toUpperCase() + ", " + giv.value.trim().toUpperCase() };
        regGo("face");
      }, "big"));
    },
    evisa: function () {   // non-permanent residents: right after the residence status
      var m = screen(T("evisa_title"), { back: function () { regGo("res"); } }); steps(m, 1, TOTAL);
      evisaPanel(m, function (r, token) {
        var n = r.person.name.split(",");
        R.evisa = token; R.person = r.person; R.data = { res_status: R.data.res_status, sur: n[0].trim(), giv: (n[1] || "").trim(), name_local: r.person.local || "", dob: r.person.dob };
        regGo("age");
      });
    },
    face: function () {   // photograph for the identity card, with liveness prompts
      var m = screen(T("face_title"), { back: function () { regGo("info"); } }); steps(m, 6, TOTAL);
      m.appendChild(el("p", { cls: "hint", text: T("face_card_photo") }));
      faceStep(m, function (res) { R.files.face = res.blob; R.face_desc = res.descriptor; setTimeout(function () { regGo("bio"); }, 600); });
    },
    bio: function () {
      var m = screen(T("bio_title"), { back: R.kiosk ? null : function () { regGo("face"); } }); steps(m, 7, TOTAL);
      var err = errBox();
      IAS.bio.available().then(function (ok) {
        if (ok) {
          m.appendChild(el("p", { cls: "lead", text: T("bio_lead") }));
          m.appendChild(btn(T("bio_setup"), function () {
            IAS.bio.create(R.data.name_en).then(function (id) { R.credential_id = id; regGo("pin"); }, function () { err.textContent = T("bio_failed"); });
          }, "big"));
          m.appendChild(err);
        } else {
          m.appendChild(el("p", { cls: "lead", text: T("bio_none") }));
          m.appendChild(btn(T("next"), function () { R.credential_id = null; regGo("pin"); }, "big"));
        }
      });
    },
    pin: function () {
      var m = screen(T("pin_title"), { back: function () { regGo("bio"); } }); steps(m, 8, TOTAL);
      m.appendChild(el("p", { cls: "lead", text: T("pin_lead") }));
      var first = null;
      var lab = el("p", { cls: "hint" });
      m.appendChild(lab);
      pinPad(m, function (pin, err) {
        if (!first) { if (weakPin(pin)) { err.textContent = T("pin_weak"); return; } first = pin; lab.textContent = T("pin_again"); err.textContent = ""; return; }
        if (pin !== first) { first = null; lab.textContent = ""; err.textContent = T("pin_mismatch"); return; }
        R.pin = pin; regGo("email");
      }, { label: T("enter_new_pin") });
    },
    email: function () {
      var m = screen(T("email_title"), { back: function () { regGo("pin"); } }); steps(m, 9, TOTAL);
      var e = el("input", { type: "email", autocomplete: "email", placeholder: "name@example.com" }), err = errBox();
      m.appendChild(field(T("email"), e, T("email_hint")));
      m.appendChild(err);
      m.appendChild(btn(T("complete_reg"), function () {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.value.trim())) { err.textContent = T("err_email"); return; }
        var b = this; b.disabled = true;
        var d = R.data;
        IAS.register({ name_en: d.name_en, name_local: d.name_local, sex: d.sex, dob: d.dob, pob: d.pob, nationality: d.nationality, res_status: d.res_status,
                       email: e.value.trim(), pin: R.pin, parent_id: R.parent_id || null, credential_id: R.credential_id || null, files: R.files, face_desc: R.face_desc, evisa: R.evisa || "" })
          .then(function (acc) {
            ME = acc;
            return !R.kiosk ? acc : IAS.kiosk.finish(R.kiosk).then(function () { return refreshMe(); });
          }).then(function (acc) { return IAS.notify(acc.id, T("mail_welcome_title"), T("mail_welcome_body", { id: acc.id_no })); })
          .then(function () { R.pin = null; regGo("done"); }, function (x) {
            var k = x && x.message;
            err.textContent = k === "device_has_account" ? T("device_has_account") : k === "face_already_registered" ? T("face_dup") : k === "face_required" ? T("face_error") : /^evisa_/.test(k) ? T(k) : String(k || x);
            b.disabled = false;
          });
      }, "big"));
    },
    done: function () {
      var m = screen(T("reg_done_title"), {}); steps(m, 10, TOTAL);
      m.appendChild(el("div", { cls: "notice ok" }, [el("div", { cls: "tick", text: "✓" }), el("h2", { text: T(ME.version === "plus" ? "reg_done_plus" : "reg_done_basic") }),
        el("p", { text: T("id_issued") }), el("p", { cls: "code big", text: ME.id_no })]));
      m.appendChild(el("p", { cls: "hint", text: T("id_issued_note") }));
      function enter(to) { unlocked(ME.id); R = null; go(to); }
      m.appendChild(btn(T("view_idcard"), function () { enter("/idcard"); }, "big"));
      m.appendChild(btn(T("start_using"), function () { enter("/home"); }, "big sec"));
    }
  };
  function regGo(step) { stopCams(); clearTimer(); REG[step](); window.scrollTo(0, 0); }

  /* ------------------------------------------------------------------ main pages */
  var PAGES = {};
  PAGES.welcome = welcome;
  PAGES.reg = function () { REG.res(); };
  PAGES.kiosk = function (id) {
    if (id) return kioskSession(id);
    var m = screen(T("reg_kiosk"), { back: "/" });
    m.appendChild(el("p", { cls: "lead", text: T("kiosk_lead") }));
    scanner(m);
    m.appendChild(el("a", { cls: "btn big sec", href: "../" + (lang === "en" ? "en" : lang) + "/reg-locations/", target: "_blank", text: T("locations") }));
  };
  /* the phone side of a kiosk session: link -> (parent's consent) -> wait for the kiosk -> finish on the phone */
  function kioskSession(id) {
    var m = screen(T("kiosk_title"), { back: "/" });
    var box = el("div", {}); m.appendChild(box);
    function show(kids) { box.innerHTML = ""; kids.forEach(function (k) { box.appendChild(k); }); }
    function msg(key) { show([el("p", { cls: "lead", text: T(key) })]); }
    function bad(key) { clearTimer(); show([el("div", { cls: "notice bad" }, [el("p", { text: T("kiosk_err_" + key) })]), btn(T("back_home"), function () { go("/"); }, "big sec")]); }
    msg("loading");
    IAS.kiosk.get(id).then(function (s) {
      if (!s || /expired|cancelled/.test(s.status) || (s.status === "done" && !s.mine)) return bad("expired");
      if (ME && s.minor && s.scanned && !s.mine && !s.parent) return parentConsent(s);
      return IAS.kiosk.claim(id).then(function (r) {
        if (r.error) return bad(r.error === "taken" && s.minor && !ME ? "parent_need_account" : r.error);
        watch();
      });
    }, function () { bad("load"); });
    function parentConsent() {
      var cb = el("input", { type: "checkbox" }), err = errBox();
      show([el("h2", { text: T("kiosk_parent_title") }), el("div", { cls: "scroll", html: T("kiosk_parent_html") }), el("label", { cls: "chk" }, [cb, el("span", { text: T("agree") })]), err,
        btn(T("kiosk_parent_agree"), function () {
          if (!cb.checked) { err.textContent = T("err_agree"); return; }
          IAS.kiosk.parent(id).then(function (r) {
            if (r.error) return bad(r.error);
            show([el("div", { cls: "notice ok" }, [el("div", { cls: "tick", text: "✓" }), el("h2", { text: T("parent_ok") }), el("p", { text: T("kiosk_parent_done") })])]);
          });
        }, "big")]);
    }
    function watch() {
      var last = "";
      function evisa() {   // residence status C or U chosen at the kiosk
        var p = el("div", {}), err = errBox(); show([el("h2", { text: T("evisa_title") }), p, err]);
        evisaPanel(p, function (r, token) {
          IAS.kiosk.evisa(id, token).then(function (x) { if (x.error) { err.textContent = T(/^evisa_/.test(x.error) ? x.error : "kiosk_err_" + x.error); return; } last = ""; poll(); }, function () { err.textContent = T("load_failed"); });
        });
      }
      function poll() {
        IAS.kiosk.get(id).then(function (s) {
          if (!timer) return;
          if (!s || /expired|cancelled/.test(s.status)) return bad("expired");
          if (s.status === "captured") { clearTimer(); return fromKiosk(id, s); }
          if (s.status === "done") {
            clearTimer();
            return refreshMe().then(function () { return IAS.notify(ME.id, T("mail_plus_title"), T("mail_plus_body")); }).then(function () {
              show([el("div", { cls: "notice ok" }, [el("div", { cls: "tick", text: "✓" }), el("h2", { text: T("upgrade_done") })]), btn(T("start_using"), function () { go("/home"); }, "big")]);
            });
          }
          if (needEvisa(s.res_status) && !s.evisa_ok) { if (last !== "evisa") { last = "evisa"; evisa(); } return; }
          var k = s.minor && !s.parent && s.res_status ? "kiosk_wait_parent" : "kiosk_wait";
          if (k !== last) { last = k; show([el("div", { cls: "notice ok" }, [el("div", { cls: "tick", text: "✓" }), el("h2", { text: T("kiosk_linked") }), el("p", { text: T(k) })])]); }
        }, function () { /* try again */ });
      }
      timer = setInterval(poll, 2000); poll();
    }
  }
  function fromKiosk(id, s) {   // particulars and photograph were taken at the kiosk; continue with steps 6-9 on the phone
    regStart();
    var p = s.p, n = p.name_en.split(", ");
    R.kiosk = id; R.data = { sur: n[0], giv: n[1] || "", name_local: p.name_local || "", sex: p.sex, dob: p.dob, pob: p.pob, nationality: p.nationality, res_status: p.res_status, name_en: p.name_en };
    R.face_desc = s.face_desc; R.parent_id = s.parent_id || null; R.evisa = s.evisa_token || null;
    fetch(s.photo).then(function (r) { return r.blob(); }).then(function (b) { R.files.face = b; regGo("bio"); });
  }
  PAGES.rebind = function () {
    var m = screen(T("rebind"), { back: "/" });
    transferIn(m);
    m.appendChild(el("hr"));
    idLogin(m, "rebind");
  };
  PAGES.signin = function () {   // log in to an account that is not on this device yet
    var m = screen(T("signin"), { back: PENDING ? "/auth/" + PENDING : "/" });
    idLogin(m, "signin");
    m.appendChild(el("hr"));
    transferIn(m);
  };
  function transferIn(m) {
    m.appendChild(el("h2", { text: T("transfer_in") }));
    var code = el("input", { type: "text", placeholder: "ABCD2345", autocomplete: "off" }), e1 = errBox();
    m.appendChild(field(T("transfer_code"), code)); m.appendChild(e1);
    m.appendChild(btn(T("transfer_claim"), function () {
      IAS.claimTransfer(code.value.trim()).then(function (a) { if (!a) { e1.textContent = T("transfer_bad"); return; } ME = a; toast(T("transfer_ok")); signedIn(); });
    }, "big sec"));
  }
  function idLogin(m, k) {
    m.appendChild(el("h2", { text: T(k + "_title") }));
    m.appendChild(el("p", { cls: "hint", text: T(k + "_lead") }));
    var id = el("input", { type: "text", placeholder: "A123456(7)", autocomplete: "off" }), e2 = errBox();
    m.appendChild(field(T("id_no"), id)); m.appendChild(e2);
    pinPad(m, function (pin) {
      var n = normId(id.value); if (!n) { e2.textContent = T("err_id"); return; }
      var m2 = screen(T(k + "_title"), { back: function () { route(); } });
      m2.appendChild(el("p", { cls: "lead", text: T("rebind_face") }));
      faceStep(m2, function (res, fail) {
        IAS.rebind(n, pin, res.descriptor).then(function (a) {
          if (!a) { fail("rebind_bad"); return; }
          ME = a; unlocked(a.id); toast(T(k + "_ok")); signedIn();
        }, function (x) {   // former number after the notice: the holder proved the identity, so the new number is told
          var c = /^id_changed:(.+)$/.exec(x && x.message || "");
          if (!c) { fail("rebind_bad"); return; }
          var m3 = screen(T("idchg_title"), { back: function () { route(); } });
          m3.appendChild(el("div", { cls: "notice" }, [el("p", { text: T("idchg_use_new") }), el("p", { cls: "code big", text: c[1] })]));
          m3.appendChild(btn(T("back"), function () { route(); }, "big"));
        });
      });
    }, { label: T("enter_pin") });
  }
  PAGES.reactivate = function () {
    var m = screen(T("reactivate"), { back: "/" });
    m.appendChild(el("p", { cls: "lead", text: T("reactivate_lead") }));
    faceStep(m, function (res, fail) {
      IAS.faceCheck(res.descriptor).then(function (r) {
        if (!r.match) { fail("face_mismatch"); return; }
        return IAS.reactivate(ME.id).then(function () { unlocked(ME.id); toast(T("reactivated")); go("/home"); });
      });
    });
  };
  PAGES.home = function () {
    var m = screen(T("app_name"), { nav: "home", lang: true });
    m.appendChild(el("div", { cls: "welcome" }, [el("p", { text: T("hello", { name: mask(ME.name_en) }) }), el("span", { cls: "ver " + ME.version, text: ME.version === "plus" ? "iAM Smart+" : "iAM Smart" })]));
    var quick = [["scan", "⌗", T("nav_scan")], ["code", "▦", T("personal_code")], ["idcard", "🪪", T("doc_idcard_short")], ["docs", "🗎", T("digital_docs")]];
    m.appendChild(el("div", { cls: "quick" }, quick.map(function (q) { return el("a", { href: "#/" + q[0] }, [el("b", { text: q[1] }), el("span", { text: q[2] })]); })));
    if (ME.version !== "plus") m.appendChild(el("a", { cls: "banner", href: "#/upgrade", text: T("upgrade_banner") }));
    m.appendChild(el("h2", { text: T("featured") }));
    m.appendChild(serviceList(4));
  };
  function serviceList(n) {
    var ul = el("ul", { cls: "svc" });
    (I18N[lang].SERVICES || I18N.en.SERVICES).slice(0, n || 99).forEach(function (s) {
      ul.appendChild(el("li", {}, [el("a", { href: s.href, target: "_blank", rel: "noopener" }, [el("small", { text: s.org }), el("span", { text: s.name })])]));
    });
    return ul;
  }
  PAGES.services = function () { var m = screen(T("nav_services"), { nav: "services" }); m.appendChild(serviceList()); };
  PAGES.scan = function () {
    var m = screen(T("nav_scan"), { nav: "scan" });
    m.appendChild(el("p", { cls: "lead", text: T("scan_lead") }));
    scanner(m);
  };
  function scanner(m) {
    var wrap = el("div", { cls: "cam qr" }), video = el("video", { playsinline: true, autoplay: true, muted: true }), err = errBox();
    wrap.appendChild(video); wrap.appendChild(el("div", { cls: "frame" })); m.appendChild(wrap); m.appendChild(err);
    function handle(raw) {
      var text = String(raw || "").trim();
      try { text = decodeURIComponent(text); } catch (e) { /* keep as read */ }
      // the QR code carries the app address with the request number (a UUID); find it wherever it is
      var id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(text);
      if (id) { go((/kiosk/i.test(text) ? "/kiosk/" : "/auth/") + id[1].toLowerCase()); return true; }
      var c = text.toUpperCase().replace(/[\s\-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
      if (/^[0-9A-Z]{6}$/.test(c)) {
        err.textContent = "";
        IAS.kiosk.byCode(c).then(function (k) {
          if (k) { go("/kiosk/" + k); return; }
          return IAS.requestByCode(c).then(function (r) { if (r) go("/auth/" + r.id); else err.textContent = T("code_bad"); });
        }).then(null,
                                  function () { err.textContent = T("load_failed"); });
        return true;
      }
      err.textContent = T("qr_unknown") + (text ? " (" + text.slice(0, 80) + ")" : ""); return false;
    }
    if ("BarcodeDetector" in window && navigator.mediaDevices) {
      var det = new window.BarcodeDetector({ formats: ["qr_code"] });
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (s) {
        streams.push(s); video.srcObject = s;
        timer = setInterval(function () { if (video.videoWidth) det.detect(video).then(function (r) { if (r[0] && handle(r[0].rawValue)) clearTimer(); }).catch(function () { /* keep trying */ }); }, 500);
      }).catch(function () { err.textContent = T("cam_unavailable"); });
    } else err.textContent = T("scan_unsupported");
    var code = el("input", { type: "text", placeholder: "AB12CD", maxlength: "6", autocomplete: "off", cls: "codein" });
    m.appendChild(field(T("code_manual"), code));
    m.appendChild(btn(T("confirm"), function () { handle(code.value); }, "big"));
  }
  function mailText(t) { return /^@\w+$/.test(t) ? T(t.slice(1)) : t; }   // messages written by the server
  PAGES.inbox = function () {
    var m = screen(T("nav_inbox"), { nav: "inbox" });
    IAS.inbox(ME.id).then(function (list) {
      if (!list.length) { m.appendChild(el("p", { cls: "empty", text: T("inbox_empty") })); return; }
      var ul = el("ul", { cls: "msgs" });
      list.forEach(function (x) {
        var li = el("li", { cls: x.read ? "" : "unread" }, [el("b", { text: mailText(x.title) }), el("small", { text: fmtTime(x.at) }), el("p", { text: mailText(x.body) })]);
        li.addEventListener("click", function () { IAS.markRead(x.n); li.className = ""; });
        ul.appendChild(li);
      });
      m.appendChild(ul);
    });
  };
  PAGES.me = function () {
    var m = screen(T("nav_me"), { nav: "me" });
    m.appendChild(el("div", { cls: "welcome" }, [el("p", { text: mask(ME.name_en) }), el("span", { cls: "ver " + ME.version, text: ME.version === "plus" ? "iAM Smart+" : "iAM Smart" })]));
    var items = [["code", T("personal_code")], ["docs", T("digital_docs")], ["eme", T("eme")], ["account", T("account_info")], ["todo", T("todo")], ["status", T("app_status")], ["settings", T("settings")]];
    if (ME.version !== "plus") items.push(["upgrade", T("upgrade")]);
    m.appendChild(el("ul", { cls: "menu" }, items.map(function (it) { return el("li", {}, [el("a", { href: "#/" + it[0], text: it[1] })]); })));
  };
  PAGES.code = function () {
    var m = screen(T("personal_code"), { back: "/me" });
    var box = el("div", { cls: "qrbox" }), info = el("dl", { cls: "kv" }), left = el("p", { cls: "hint" });
    m.appendChild(box); m.appendChild(left); m.appendChild(el("h3", { text: T("partial_data") })); m.appendChild(info);
    m.appendChild(el("div", { cls: "notice" }, [el("b", { text: T("important_note") }), el("p", { text: T("code_note") })]));
    function draw() {
      var ts = new Date().toISOString();
      sha256(ME.id_no + "|" + ts.slice(0, 16)).then(function (h) {
        box.innerHTML = ""; box.appendChild(qrCanvas(["IASPC", mask(ME.name_en), ageGroup(ME.dob), h.slice(0, 16), ts].join("|"), 240));
        info.innerHTML = "";
        [[T("name_en"), mask(ME.name_en)], [T("age_group"), ageGroup(ME.dob)], [T("generated"), fmtTime(ts)]].forEach(function (r) { info.appendChild(el("dt", { text: r[0] })); info.appendChild(el("dd", { text: r[1] })); });
      });
    }
    draw(); var n = 60; left.textContent = T("code_refresh", { n: n });
    timer = setInterval(function () { n--; if (n <= 0) { n = 60; draw(); } left.textContent = T("code_refresh", { n: n }); }, 1000);
  };
  function cardVals() {
    var p = String(ME.name_en || "").split(",");
    return { idtype: "first", idno: ME.id_no, issued: ME.card_issued_at || ME.created_at, status: ME.res_status || "A", kornat: ME.nationality === "KOR" ? "KOR" : "OTH",
             surname: (p[0] || "").trim(), given: (p[1] || "").trim(), local: ME.name_local || "", sex: ME.sex, dob: ME.dob,
             pob: ME.pob === "XX" ? "US" : (ME.pob || "BHG"), chgbirth: "N", chgname: "N", dobproof: "Y", office: "hq" };
  }
  function docTitle(r) { return lang.indexOf("zh") === 0 ? r.zh : r.en; }
  PAGES.docs = function () {
    var m = screen(T("digital_docs"), { back: "/me" });
    var id = el("a", { cls: "doc idc", href: "#/idcard" }, [el("small", { text: T("doc_idcard") }), el("b", { text: ME.id_no }), el("p", { text: T("doc_idcard_sub") })]);
    m.appendChild(id);
    var box = el("div"); m.appendChild(box);
    IAS.myDocuments().then(function (list) {
      (list || []).forEach(function (r) {
        var card = el("div", { cls: "doc" }, [el("small", { text: r.mode === "ext" ? T("doc_cos") : T("doc_entry") }), el("b", { text: docTitle(r) }), el("p", { text: r.ref })]);
        if (window.BHGEVisaExpired && window.BHGEVisaExpired(r)) { card.appendChild(el("p", { cls: "err", text: T("evisa_over") })); box.appendChild(card); return; }
        card.appendChild(btn(T("show_qr"), function () {
          var b = this; b.disabled = true;
          IAS.records.evisaToken(r.ref, ME.dob).then(function (x) { card.appendChild(el("div", { cls: "qrbox" }, [qrCanvas(x.token, 220)])); b.remove(); }).catch(function () { b.disabled = false; toast(T("load_failed")); });
        }, "sec"));
        if (window.BHGEVisaPDF) card.appendChild(btn(T("download_pdf"), function () { var b = this; b.disabled = true; window.BHGEVisaPDF(r, ME.dob).then(function () { b.disabled = false; }, function () { b.disabled = false; toast(T("load_failed")); }); }, "sec"));
        box.appendChild(card);
      });
    }).catch(function () { box.appendChild(el("p", { cls: "err", text: T("load_failed") })); });
  };
  PAGES.idcard = function () {
    var m = screen(T("doc_idcard"), { back: "/docs" });
    var holder = el("div", { cls: "idcard" }, [el("p", { cls: "hint", text: T("loading") })]); m.appendChild(holder);
    var err = errBox(); m.appendChild(err);
    IAS.file(ME.id, "face").then(function (photo) {
      if (!window.BHGIdCardImages) throw new Error("card");
      photo = photo || new Blob([new Uint8Array(0)], { type: "image/jpeg" });
      return window.BHGIdCardImages(cardVals(), photo).then(function (c) {
        holder.innerHTML = "";
        c.front.className = "cardimg"; c.back.className = "cardimg"; holder.appendChild(c.front); holder.appendChild(c.back);
        m.appendChild(el("dl", { cls: "kv" }, [el("dt", { text: T("id_no") }), el("dd", { text: ME.id_no }), el("dt", { text: T("symbols") }), el("dd", { text: c.sym })]));
        m.appendChild(btn(T("download_pdf"), function () { window.BHGIdCardPDF(cardVals(), photo); }, "big"));
      });
    }).catch(function () { holder.innerHTML = ""; err.textContent = T("load_failed"); });
  };
  PAGES.status = function () {
    var m = screen(T("app_status"), { back: "/me" });
    IAS.myDocuments().then(function (list) {
      if (!list || !list.length) { m.appendChild(el("p", { cls: "empty", text: T("status_empty") })); return; }
      list.forEach(function (r) { m.appendChild(el("div", { cls: "doc" }, [el("small", { text: r.ref }), el("b", { text: docTitle(r) }), el("p", { text: T("status_approved", { d: r.issued }) })])); });
    });
  };
  PAGES.todo = function () {
    var m = screen(T("todo"), { back: "/me" });
    var items = [];
    if (!ME.email_verified) items.push([T("todo_email"), "#/account"]);
    if (Date.now() - Date.parse(ME.pin_changed_at) > 90 * 864e5) items.push([T("todo_pin"), "#/settings"]);
    if (ME.version !== "plus") items.push([T("todo_plus"), "#/upgrade"]);
    if (!items.length) { m.appendChild(el("p", { cls: "empty", text: T("todo_empty") })); return; }
    m.appendChild(el("ul", { cls: "menu" }, items.map(function (x) { return el("li", {}, [el("a", { href: x[1], text: x[0] })]); })));
  };
  var EME_FIELDS = ["email", "email2", "mobile", "home_tel", "office_tel", "prefix", "education", "marital", "postal_address", "residential_address", "billing_address"];
  PAGES.eme = function () {
    var m = screen(T("eme"), { back: "/me" });
    m.appendChild(el("p", { cls: "lead", text: T("eme_lead") }));
    IAS.profile(ME.id).then(function (p) {
      p = p || {};
      var inputs = {};
      EME_FIELDS.forEach(function (k) {
        var inp;
        if (k === "prefix") { inp = el("select", {}, ["", "Mr", "Mrs", "Ms", "Miss", "Dr"].map(function (v) { return el("option", { value: v, text: v ? T("prefix_" + v) : T("choose") }); })); }
        else if (k === "education") { inp = el("select", {}, ["", "primary", "secondary", "post", "degree", "master", "doctor"].map(function (v) { return el("option", { value: v, text: v ? T("edu_" + v) : T("choose") }); })); }
        else if (k === "marital") { inp = el("select", {}, ["", "single", "married", "divorced", "widowed"].map(function (v) { return el("option", { value: v, text: v ? T("mar_" + v) : T("choose") }); })); }
        else if (/address/.test(k)) inp = el("textarea", { rows: "3" });
        else inp = el("input", { type: /email/.test(k) ? "email" : /tel|mobile/.test(k) ? "tel" : "text" });
        inp.value = p[k] || "";
        inputs[k] = inp;
        m.appendChild(field(T("eme_" + k), inp));
      });
      var err = errBox(); m.appendChild(err);
      m.appendChild(btn(T("save"), function () {
        var data = {}; EME_FIELDS.forEach(function (k) { data[k] = inputs[k].value.trim(); });
        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { err.textContent = T("err_email"); return; }
        if (data.mobile && !/^[0-9+\-\s]{8,15}$/.test(data.mobile)) { err.textContent = T("err_tel"); return; }
        IAS.saveProfile(ME.id, data).then(function () { toast(T("saved")); });
      }, "big"));
    });
  };
  PAGES.account = function () {
    var m = screen(T("account_info"), { back: "/me" });
    var dl = el("dl", { cls: "kv" });
    [[T("name_en"), ME.name_en], [T("name_local"), ME.name_local || "-"], [T("id_no"), maskId(ME.id_no)], [T("sex"), ME.sex === "F" ? T("female") : T("male")], [T("dob"), ME.dob],
     [T("version"), ME.version === "plus" ? "iAM Smart+" : "iAM Smart"], [T("registered"), fmtTime(ME.created_at)]].forEach(function (r) { dl.appendChild(el("dt", { text: r[0] })); dl.appendChild(el("dd", { text: r[1] })); });
    m.appendChild(dl);
    m.appendChild(el("h3", { text: T("contact_email") }));
    var e = el("input", { type: "email", value: ME.email || "" }), err = errBox();
    m.appendChild(field(T("email") + (ME.email_verified ? " ✓ " + T("verified") : " – " + T("not_verified")), e)); m.appendChild(err);
    m.appendChild(btn(T("save"), function () {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.value.trim())) { err.textContent = T("err_email"); return; }
      var changed = e.value.trim() !== ME.email;
      IAS.update(ME.id, changed ? { email: e.value.trim(), email_verified: false } : {}).then(function (a) { ME = a; toast(T("saved")); route(); });
    }, "sec"));
    if (!ME.email_verified) {
      m.appendChild(btn(T("verify_email"), function () {
        var code = String(Math.floor(100000 + Math.random() * 900000));
        IAS.notify(ME.id, T("mail_verify_title"), T("mail_verify_body", { c: code, e: ME.email })).then(function () {
          toast(T("verify_sent"));
          var c = el("input", { type: "text", inputmode: "numeric", maxlength: "6" }), e2 = errBox();
          m.appendChild(field(T("verify_code"), c)); m.appendChild(e2);
          m.appendChild(btn(T("confirm"), function () { if (c.value.trim() !== code) { e2.textContent = T("verify_bad"); return; } IAS.update(ME.id, { email_verified: true }).then(function (a) { ME = a; toast(T("verified")); route(); }); }, "big"));
        });
      }, "big"));
    }
  };
  function confirmAuth(m, onOk, label) {   // biometric or PIN confirmation for a sensitive action
    var err = errBox();
    if (ME.credential_id) {
      m.appendChild(btn(T("confirm_bio"), function () { IAS.bio.verify(ME.credential_id).then(onOk, function () { err.textContent = T("bio_failed"); }); }, "big"));
      m.appendChild(err);
      m.appendChild(el("p", { cls: "or", text: T("or_pin") }));
    }
    pinPad(m, function (pin, e2) {
      IAS.verifyPin(ME.id, pin).then(function (r) {
        if (r.ok) { IAS.notify(ME.id, T("mail_pin_title"), T("mail_pin_body", { t: fmtTime(new Date().toISOString()) })); return onOk(); }
        if (r.invalid) return invalid();
        e2.textContent = T("pin_wrong", { n: r.remaining });
      });
    }, { label: label || T("enter_pin") });
  }
  PAGES.settings = function (arg) {
    if (arg && SET[arg]) return SET[arg]();
    var m = screen(T("settings"), { back: "/me" });
    var items = [["login", T("set_login")], ["pin", T("set_pin")], ["transfer", T("set_transfer")], ["logs", T("set_logs")], ["logout", T("set_auto")], ["security", T("set_security")]];
    m.appendChild(el("ul", { cls: "menu" }, items.map(function (it) { return el("li", {}, [el("a", { href: "#/settings/" + it[0], text: it[1] })]); })));
    m.appendChild(btn(T("logout"), function () { leave("/"); }, "sec big"));
  };
  var SET = {
    login: function () {
      var m = screen(T("set_login"), { back: "/settings" });
      IAS.bio.available().then(function (ok) {
        var opts = [["pin", T("login_pin_only")]]; if (ok) opts.unshift(["bio", T("login_bio")]);
        opts.forEach(function (o) {
          var r = el("input", { type: "radio", name: "lm", value: o[0] }); r.checked = (ME.login_method || "pin") === o[0];
          r.addEventListener("change", function () {
            var p = o[0] === "bio" && !ME.credential_id ? IAS.bio.create(ME.name_en).then(function (id) { return IAS.update(ME.id, { credential_id: id, login_method: "bio" }); }) : IAS.update(ME.id, { login_method: o[0] });
            p.then(function (a) { ME = a; toast(T("saved")); }, function () { toast(T("bio_failed")); });
          });
          m.appendChild(el("label", { cls: "chk" }, [r, el("span", { text: o[1] })]));
        });
      });
    },
    pin: function () {
      var m = screen(T("set_pin"), { back: "/settings" });
      var stage = 0, first = null, lab = el("p", { cls: "hint", text: T("enter_old_pin") }); m.appendChild(lab);
      pinPad(m, function (pin, err) {
        if (stage === 0) {
          IAS.verifyPin(ME.id, pin).then(function (r) { if (r.invalid) return invalid(); if (!r.ok) { err.textContent = T("pin_wrong", { n: r.remaining }); return; } stage = 1; err.textContent = ""; lab.textContent = T("enter_new_pin"); });
        } else if (stage === 1) { if (weakPin(pin)) { err.textContent = T("pin_weak"); return; } first = pin; stage = 2; lab.textContent = T("pin_again"); err.textContent = ""; }
        else { if (pin !== first) { stage = 1; err.textContent = T("pin_mismatch"); lab.textContent = T("enter_new_pin"); return; }
               IAS.setPin(ME.id, pin).then(function () { return IAS.notify(ME.id, T("mail_pinchg_title"), T("mail_pinchg_body")); }).then(function () { toast(T("pin_changed")); go("/settings"); }); }
      });
    },
    transfer: function () {
      var m = screen(T("set_transfer"), { back: "/settings" });
      m.appendChild(el("p", { cls: "lead", text: T("transfer_lead") }));
      confirmAuth(m, function () {
        IAS.createTransfer(ME.id).then(function (code) {
          var m2 = screen(T("set_transfer"), { back: "/settings" });
          m2.appendChild(el("p", { cls: "lead", text: T("transfer_show") }));
          m2.appendChild(el("div", { cls: "qrbox" }, [el("p", { cls: "code big", text: code })]));
          m2.appendChild(el("p", { cls: "hint", text: T("transfer_note") }));
        });
      });
    },
    logs: function () {
      var m = screen(T("set_logs"), { back: "/settings" });
      IAS.logs(ME.id, 90).then(function (list) {
        var t = el("table", { cls: "logs" }, [el("tr", {}, [el("th", { text: T("log_time") }), el("th", { text: T("log_action") }), el("th", { text: T("log_service") })])]);
        list.forEach(function (x) { t.appendChild(el("tr", {}, [el("td", { text: fmtTime(x.at) }), el("td", { text: T("act_" + x.action) }), el("td", { text: x.client })])); });
        m.appendChild(t);
      });
    },
    logout: function () {
      var m = screen(T("set_auto"), { back: "/settings" });
      [1, 3, 5, 10].forEach(function (n) {
        var r = el("input", { type: "radio", name: "al", value: n }); r.checked = (ME.auto_logout || 5) === n;
        r.addEventListener("change", function () { IAS.update(ME.id, { auto_logout: n }).then(function (a) { ME = a; toast(T("saved")); }); });
        m.appendChild(el("label", { cls: "chk" }, [r, el("span", { text: T("minutes", { n: n }) })]));
      });
    },
    security: function () {
      var m = screen(T("set_security"), { back: "/settings" });
      m.appendChild(btn(T("suspend"), function () { if (confirm(T("suspend_confirm"))) IAS.suspend(ME.id).then(function () { relock(); route(); }); }, "sec big"));
      m.appendChild(btn(T("deregister"), function () { go("/settings/dereg"); }, "danger big"));
    },
    dereg: function () {
      var m = screen(T("deregister"), { back: "/settings/security" });
      m.appendChild(el("div", { cls: "notice bad" }, [el("p", { text: T("dereg_lead") })]));
      confirmAuth(m, function () { IAS.deleteAccount(ME.id).then(function () { ME = null; relock(); toast(T("dereg_done")); go("/"); }); });
    }
  };
  PAGES.upgrade = function () {   // iAM Smart+ = facial identification again; the identity card was issued by iAM Smart
    var m = screen(T("upgrade"), { back: "/me" });
    m.appendChild(el("div", { cls: "scroll", html: T("declaration_html") }));
    var cb = el("input", { type: "checkbox" }), err = errBox();
    m.appendChild(el("label", { cls: "chk" }, [cb, el("span", { text: T("agree") })])); m.appendChild(err);
    m.appendChild(btn(T("start"), function () {
      if (!cb.checked) { err.textContent = T("err_agree"); return; }
      var m3 = screen(T("face_title"), { back: "/me" });
      m3.appendChild(el("p", { cls: "hint", text: T("face_same_person") }));
      faceStep(m3, function (res, fail) {
        IAS.faceCheck(res.descriptor).then(function (r) {
          if (!r.match) { fail("face_mismatch"); return; }
          return IAS.putFile(ME.id, "face_upgrade", res.blob).then(function () { return IAS.upgrade(ME.id); }).then(function (a) {
            ME = a; return IAS.notify(ME.id, T("mail_plus_title"), T("mail_plus_body"));
          }).then(function () {
            var m4 = screen(T("upgrade"), {});
            m4.appendChild(el("div", { cls: "notice ok" }, [el("div", { cls: "tick", text: "✓" }), el("h2", { text: T("upgrade_done") })]));
            m4.appendChild(btn(T("start_using"), function () { go("/home"); }, "big"));
          });
        });
      });
    }, "big"));
  };

  /* ------------------------------------------------------------------ requests from online services */
  var SCOPE_LABEL = { id_no: "id_no", name_en: "name_en", name_local: "name_local", sex: "sex", dob: "dob", pob: "pob", nationality: "nationality", res_status: "res_status",
                      email: "email", email2: "eme_email2", mobile: "eme_mobile", home_tel: "eme_home_tel", office_tel: "eme_office_tel", prefix: "eme_prefix",
                      education: "eme_education", marital: "eme_marital", postal_address: "eme_postal_address", residential_address: "eme_residential_address",
                      billing_address: "eme_billing_address" };
  PAGES.auth = function (id) {
    IAS.request(id).then(function (r) {
      var m = screen(T("auth_title"), { back: "/home" });
      if (!r) { m.appendChild(el("p", { cls: "err", text: T("req_none") })); return; }
      if (r.status !== "pending" || Date.parse(r.expires_at) < Date.now()) { m.appendChild(el("p", { cls: "err", text: T("req_" + (r.status === "pending" ? "expired" : r.status)) })); return; }
      if (r.purpose === "sign" && ME.version !== "plus") { m.appendChild(el("p", { cls: "err", text: T("sign_need_plus") })); m.appendChild(btn(T("upgrade"), function () { go("/upgrade"); }, "big")); return; }
      m.appendChild(el("div", { cls: "client" }, [el("small", { text: T("req_from") }), el("b", { text: r.client_name })]));
      m.appendChild(el("p", { cls: "lead", text: T("purpose_" + r.purpose) }));
      if (r.scope && r.scope.length && r.purpose !== "sign") {
        m.appendChild(el("h3", { text: T("data_shared") }));
        m.appendChild(el("ul", { cls: "scope" }, r.scope.map(function (k) { return el("li", { text: T(SCOPE_LABEL[k] || k) }); })));
      }
      if (r.purpose === "sign") m.appendChild(el("div", { cls: "notice" }, [el("p", { text: T("sign_hash") }), el("p", { cls: "code big", text: r.digest.slice(0, 4).toUpperCase() })]));
      var left = el("p", { cls: "hint" }); m.appendChild(left);
      function tick() { var s = Math.max(0, Math.round((Date.parse(r.expires_at) - Date.now()) / 1000)); left.textContent = T("req_left", { n: s }); if (!s) { clearTimer(); route(); } }
      tick(); timer = setInterval(tick, 1000);
      m.appendChild(btn(T("reject"), function () { IAS.decide(r.id, ME.id, false).then(function () { done(false); }); }, "sec big"));
      var box = el("div"); m.appendChild(box);
      confirmAuth(box, function () { IAS.decide(r.id, ME.id, true).then(function (x) { done(x && x.status === "approved"); }); }, T("approve_pin"));
      function done(okay) {
        var m2 = screen(T("auth_title"), {});
        var closable = !!window.opener || history.length <= 2;
        if (closable) {
          m2.appendChild(el("p", { cls: "hint", text: T("auth_closing") }));
          setTimeout(function () { try { window.close(); } catch (e) { /* ignore */ } }, 1500);
        }
        m2.appendChild(el("div", { cls: "notice " + (okay ? "ok" : "bad") }, [el("div", { cls: "tick", text: okay ? "✓" : "✕" }), el("h2", { text: okay ? T("auth_ok", { c: r.client_name }) : T("auth_rejected") })]));
        m2.appendChild(btn(T("back_home"), function () { go("/home"); }, "big"));
      }
    });
  };

  route();
})();
