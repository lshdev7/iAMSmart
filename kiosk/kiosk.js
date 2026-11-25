/* "iAM Smart" self-registration kiosk. The screen is a fixed 1280 x 720 stage inside the drawing of the machine (or alone
   in "screen only" mode). Data goes through window.IAS.kiosk.*; the applicant's phone joins by scanning the QR code. */
(function () {
  "use strict";
  var I18N = window.IAS_KIOSK_I18N, LANGS = ["zh-hant", "zh-hans", "en", "ko"], LAB = { "zh-hant": "繁", "zh-hans": "简", en: "ENG", ko: "한" };
  var $ = function (id) { return document.getElementById(id); }, SCREEN = $("screen");
  var lang = (function () {
    var q = /[?&]lang=([\w-]+)/.exec(location.search), s = null;
    try { s = localStorage.getItem("ias-kiosk-lang"); } catch (e) { s = null; }
    var l = ((q && q[1]) || s || navigator.language || "en").toLowerCase();
    if (l.indexOf("ko") === 0) return "ko";
    if (/^zh-(hans|cn|sg)/.test(l)) return "zh-hans";
    return l.indexOf("zh") === 0 ? "zh-hant" : "en";
  })();
  var voice = false, S = null, timers = [], stream = null, faceRun = null, lastAct = Date.now(), noIdle = true, slotFn = null, gen = 0;
  function T(k, v) { var s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k; Object.keys(v || {}).forEach(function (x) { s = s.split("{" + x + "}").join(v[x]); }); return s; }

  function el(tag, p, kids) {
    var e = document.createElement(tag); p = p || {};
    Object.keys(p).forEach(function (k) {
      if (k === "text") e.textContent = p[k]; else if (k === "cls") e.className = p[k]; else if (k === "click") e.addEventListener("click", p[k]);
      else if (p[k] !== undefined && p[k] !== null && p[k] !== false) e.setAttribute(k, p[k] === true ? "" : p[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function svg(markup) { var d = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" ' + markup, "image/svg+xml"); return document.importNode(d.documentElement, true); }
  function btn(t, fn, cls) { return el("button", { type: "button", cls: "kb " + (cls || ""), text: t, click: fn }); }
  function errBox() { return el("p", { cls: "err", role: "alert" }); }
  function say(t) {
    if (!voice || !window.speechSynthesis) return;
    try { var u = new SpeechSynthesisUtterance(t); u.lang = lang === "ko" ? "ko-KR" : lang === "zh-hans" ? "zh-CN" : lang === "zh-hant" ? "zh-HK" : "en-GB"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voice */ }
  }
  function every(ms, fn) { timers.push(setInterval(fn, ms)); }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function qr(text, size) {
    var q = window.qrcode(0, "M"); q.addData(text, "Byte"); q.make();
    var n = q.getModuleCount(), c = el("canvas", { width: size, height: size }), x = c.getContext("2d"), m = size / (n + 8);
    x.fillStyle = "#fff"; x.fillRect(0, 0, size, size); x.fillStyle = "#111";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(Math.floor((k + 4) * m), Math.floor((r + 4) * m), Math.ceil(m), Math.ceil(m));
    return c;
  }
  var SPK = 'viewBox="0 0 48 48"><path d="M8 19h8l11-9v28l-11-9H8z"/><path d="M32 18c3 3 3 9 0 12M37 13c6 6 6 16 0 22"/></svg>';
  function speaker() {
    var b = el("button", { type: "button", cls: "spk" + (voice ? " on" : ""), "aria-label": T("voice"), "aria-pressed": voice ? "true" : "false", click: function () { voice = !voice; b.className = "spk" + (voice ? " on" : ""); b.setAttribute("aria-pressed", voice ? "true" : "false"); if (voice) say(T("voice")); else if (window.speechSynthesis) speechSynthesis.cancel(); } }, [svg(SPK)]);
    return b;
  }

  /* ------------------------------------------------------------------ machine */
  function stopCam() { if (faceRun) { faceRun.stop(); faceRun = null; } if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } $("machine").classList.remove("lit"); }
  function slot(on, mode, fn) {   // the slot of the machine shows the same card
    var c = $("card"); c.textContent = "";
    if (on && S && S.face && mode !== "held") c.appendChild(el("img", { src: S.face, alt: "" }));
    $("slot").className = "slot" + (on ? " on " + (mode || "") : ""); slotFn = on ? fn || null : null;
  }
  $("slot").addEventListener("click", function () { var f = slotFn; if (f) f(); });
  function reset() { gen++; timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; stopCam(); slot(false); }
  function show(cls) { reset(); SCREEN.innerHTML = ""; var d = el("div", { cls: "scr lang-" + lang + " " + (cls || "") }); SCREEN.appendChild(d); lastAct = Date.now(); return d; }
  function signs() {
    document.documentElement.lang = lang; document.title = T("title");
    $("sgApp").textContent = T("sign_app"); if (lang !== "en") $("sgApp").appendChild(el("span", { text: I18N.en.sign_app }));
    $("sgMeth").textContent = T("sign_methods"); $("sgHot").textContent = T("sign_hot"); $("sgCard").textContent = T("sign_card"); if (lang !== "en") $("sgCard").appendChild(el("small", { text: I18N.en.sign_card }));
    $("sgChip").textContent = T("sign_chip"); 
    $("sgQr").textContent = ""; $("sgQr").appendChild(qr(location.origin + "/iAMSmart/" + lang + "/reg/", 168));
    $("mode").textContent = document.body.classList.contains("only") ? T("machine") : T("full");
  }
  function fit() {
    var only = document.body.classList.contains("only"), vw = document.documentElement.clientWidth, vh = window.innerHeight, w = only ? 1280 : 1900, h = only ? 720 : 3010;
    var k = only ? Math.min(vw / 1280, vh / 720) : Math.min(vw / 1900, Math.max(vh / 1640, 0.3));
    $("machine").style.transform = "scale(" + k + ")"; $("fit").style.width = Math.floor(w * k) + "px"; $("fit").style.height = Math.floor(h * k) + "px";
    $("fit").style.marginTop = only ? Math.max(0, (vh - h * k) / 2) + "px" : "0";
  }
  function setOnly(on) { document.body.classList.toggle("only", on); signs(); fit(); }
  $("mode").addEventListener("click", function () {
    var on = !document.body.classList.contains("only"); setOnly(on);
    try { if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { /* not allowed */ }); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* not supported */ }
  });
  window.addEventListener("resize", fit);

  /* ------------------------------------------------------------------ time-out */
  ["pointerdown", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, true); });
  setInterval(function () {
    if (SCREEN.querySelector(".modal")) return;
    var idle = Date.now() - lastAct;
    if (!S) { if (SCREEN.querySelector(".home") && idle > 45000) attract(); return; }
    if (!noIdle && idle > 60000) idleAsk();
  }, 1000);
  function modal(title, body, buttons) {
    var p = el("p", { text: body }), m = el("div", { cls: "modal" }, [el("div", {}, [title ? el("h2", { text: title }) : null, p, el("div", {}, buttons)])]);
    SCREEN.firstChild.appendChild(m); return { m: m, p: p };
  }
  function idleAsk() {
    var n = 20, h = modal(T("idle_title"), T("idle_body", { n: n }), [btn(T("idle_yes"), function () { clearInterval(iv); h.m.remove(); lastAct = Date.now(); }, "pri"), btn(T("exit"), function () { clearInterval(iv); leave(); }, "gray")]);
    say(T("idle_title"));
    var iv = setInterval(function () { if (!h.m.isConnected) { clearInterval(iv); return; } n--; h.p.textContent = T("idle_body", { n: n }); if (n <= 0) { clearInterval(iv); leave(); } }, 1000);
  }
  function leave() { if (S && S.card) IAS.kiosk.release().catch(function () { /* expires by itself */ }); if (S && S.id && !S.finished) IAS.kiosk.cancel(S.id).catch(function () { /* expires by itself */ }); S = null; home(); }

  /* ------------------------------------------------------------------ attract screen and home */
  function attract() {
    var d = show("attract"), r = [[60, 470], [120, 615], [52, 376], [225, 268], [352, 467], [392, 45], [710, 364], [953, 494], [860, 540], [754, 622], [1040, 600], [1230, 450], [1128, 632]], lines = [[0, 1], [0, 2], [2, 3], [3, 5], [3, 4], [4, 1], [4, 6], [6, 8], [4, 9], [9, 8], [9, 12], [7, 6], [2, 4], [8, 10]];
    d.appendChild(svg('class="net" viewBox="0 0 1280 720">' + lines.map(function (l) { return '<path d="M' + r[l[0]] + "L" + r[l[1]] + '" stroke="#fff" stroke-width="3" opacity=".8"/>'; }).join("") + r.map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i % 3 === 0 ? 14 : 7) + '" fill="#fff"/>'; }).join("") + "</svg>"));
    d.appendChild(el("img", { src: "../assets/logo.svg", alt: "iAM Smart" }));
    var pl = svg('class="plus" viewBox="0 0 66 66"><path d="M28 2h16l-5 28H23z" fill="#f2a33a"/><path d="M2 26h28l-3 14H0z" fill="#3d8fd6"/><path d="M36 26h28l-3 14H33z" fill="#e8710a"/><path d="M24 38h16l-5 26H19z" fill="#7ab648"/></svg>'); d.appendChild(pl);
    d.appendChild(el("h1", { text: T("attract1") })); d.appendChild(el("h2", { text: T("attract2") })); d.appendChild(el("p", { text: T("touch") }));
    d.addEventListener("click", home); S = null;
  }
  var IC = {
    reg: 'viewBox="0 0 78 78"><rect x="6" y="6" width="52" height="66" rx="8" fill="#fff"/><path d="M17 24h30M17 36h30M17 48h16" stroke="#35997f" stroke-width="5"/><path d="M44 62l4-14 20-20 10 10-20 20z" fill="#fff" stroke="#35997f" stroke-width="4"/></svg>',
    up: 'viewBox="0 0 78 78"><circle cx="39" cy="39" r="35" fill="none" stroke="#fff" stroke-width="5"/><circle cx="39" cy="39" r="27" fill="#fff"/><path d="M39 55V26M28 36l11-11 11 11" fill="none" stroke="#e8990f" stroke-width="6"/></svg>',
    sus: 'viewBox="0 0 78 78"><rect x="2" y="8" width="70" height="52" rx="7" fill="#fff"/><circle cx="20" cy="27" r="7" fill="#e04f57"/><path d="M9 47c2-13 20-13 22 0zM40 22h22M40 33h16" fill="#e04f57" stroke="#e04f57" stroke-width="4"/><circle cx="60" cy="58" r="18" fill="#fff" stroke="#e04f57" stroke-width="4"/><text x="60" y="66" font-size="24" font-weight="700" text-anchor="middle" fill="#e04f57" font-family="Arial">?</text></svg>'
  };
  function home() {
    var d = show("home"); S = null; signs();
    d.appendChild(el("p", { cls: "w1", text: T("welcome1") })); d.appendChild(el("h1", { cls: "w2", text: T("welcome2") }));
    function tile(c, k, ic, fn) { d.appendChild(el("button", { type: "button", cls: "tile " + c, click: fn }, [el("b", { text: T(k) }), el("span", { text: T(k + "2") }), svg(IC[ic])])); }
    tile("t1", "c_reg", "reg", regAge); tile("t2", "c_up", "up", upIntro); tile("t3", "c_sus", "sus", susIntro);
    d.appendChild(el("div", { cls: "pill" }, LANGS.map(function (l) { return el("button", { type: "button", cls: l === lang ? "on" : "", "data-lang": l, text: LAB[l], click: function () { lang = l; try { localStorage.setItem("ias-kiosk-lang", l); } catch (e) { /* ignore */ } home(); } }); })));
    d.appendChild(speaker());
    say(T("welcome1") + " " + T("welcome2"));
  }

  /* ------------------------------------------------------------------ flow frame */
  function frame(step, title, opts) {
    opts = opts || {};
    var d = show("flow"), on = S.steps.indexOf(step); noIdle = !!opts.noIdle;
    d.appendChild(el("div", { cls: "rail" }, [el("h3", { text: T("process_" + S.kind) }), el("ol", {}, S.steps.map(function (s, i) { return el("li", { cls: i < on ? "ok" : i === on || (opts.alsoOn && opts.alsoOn.indexOf(s) >= 0) ? "on" : "", text: T(s) }); }))]));
    var m = el("div", { cls: "main" }, [title ? el("h2", { text: title }) : null]); d.appendChild(m);
    var f = el("div", { cls: "foot2" }, [btn(T("exit"), askLeave, "gray"), opts.back ? btn(T("back"), opts.back) : null, el("span", { cls: "gap" }), speaker()]); d.appendChild(f);
    m.foot = function (b) { f.insertBefore(b, f.lastChild); return b; };
    if (opts.noExit) f.firstChild.remove();
    if (title) say(title);
    return m;
  }
  function askLeave() { if (SCREEN.querySelector(".modal")) return; var h = modal("", T("cancel_q"), [btn(T("yes"), leave, "pri"), btn(T("no"), function () { h.m.remove(); }, "gray")]); }
  function fatal(key) { var m = frame("", T(key), { noExit: true }); m.foot(btn(T("finish"), leave, "pri")); }
  function begin(kind) {
    S = { kind: kind, data: {} };
    S.steps = kind === "reg" ? ["p_scan", "p_decl", "p_info", "p_face", "p_bio", "p_pin", "p_email"] : kind === "up" ? ["p_scan", "p_decl", "p_card", "p_face"] : ["p_no", "p_card", "p_confirm", "p_face"];
  }
  function readyList(keys) { return el("div", { cls: "ready" }, [el("b", { text: T("ready") }), el("ul", {}, keys.map(function (k) { return el("li", { text: T(k) }); }))]); }

  /* ------------------------------------------------------------------ registration / upgrade: start */
  function regAge() {
    begin("reg");
    var m = frame("", T("age_title"));
    m.appendChild(el("div", { cls: "choose" }, [
      el("button", { type: "button", cls: "big", text: T("age_adult"), click: function () { S.minor = false; start(); } }),
      el("button", { type: "button", cls: "big b2", click: function () { S.minor = true; start(); } }, [T("age_minor"), el("small", { text: T("age_minor2") })])]));
    m.appendChild(readyList(["ready_phone", "ready_email"]));
    function start() { S.steps = S.minor ? ["p_scan", "p_parent", "p_decl", "p_info", "p_face", "p_bio", "p_pin", "p_email"] : S.steps; scan(); }
  }
  function upIntro() {
    begin("up");
    var m = frame("", T("up_title"));
    m.appendChild(el("p", { cls: "lead", text: T("up_lead") })); m.appendChild(readyList(["ready_phone_u", "ready_card"]));
    m.foot(btn(T("apply"), scan, "pri"));
  }
  function appUrl(id) { return location.origin + IAS.config.appPath + "?lang=" + lang + "#/kiosk/" + id; }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function qrPanel(id, code, until, again) {
    var left = el("small", {}), card = el("div", { cls: "qrcard" }, [qr(appUrl(id), 600), el("small", { text: T("scan_code") }), el("b", { text: code }), left]);
    function tick() {
      var ms = until() - Date.now();
      left.textContent = ms > 0 ? T("scan_left", { t: mmss(ms) }) : T("scan_expired");
      if (ms <= 0 && !card.classList.contains("dead")) { card.classList.add("dead"); card.appendChild(btn(T("scan_new"), again, "pri")); noIdle = false; }
    }
    tick(); every(1000, tick); return card;
  }
  function scan() {
    var m = frame("p_scan", T("scan_title"), { noIdle: true, back: S.kind === "reg" ? regAge : upIntro }), g = gen;
    m.appendChild(el("div", { cls: "spin" }));
    if (S.id) IAS.kiosk.cancel(S.id).catch(function () { /* replaced below */ });
    S.id = null;
    IAS.kiosk.create(S.kind === "reg" ? "reg" : "upgrade", !!S.minor).then(function (k) {
      if (g !== gen) { IAS.kiosk.cancel(k.id); return; }
      S.id = k.id; S.code = k.code; m.lastChild.remove();
      var end = Date.parse(k.expires_at) || Date.now() + 180000;
      m.appendChild(el("div", { cls: "qrrow" }, [el("ol", {}, ["scan_1", S.kind === "reg" ? "scan_2r" : "scan_2u", "scan_3"].map(function (x) { return el("li", { text: T(x) }); })), qrPanel(k.id, k.code, function () { return end; }, scan)]));
      watch(g, function (s) { if (!s.scanned) return false; S.minor = s.minor; S.card = s.card; scanned(); return true; });
    }, function () { if (g === gen) fatal("e_load"); });
  }
  /* poll the session until fn(session) returns true */
  function watch(g, fn) {
    var busy = false, ended = false;
    every(1500, function () {
      if (busy || ended) return; busy = true;
      IAS.kiosk.get(S.id).then(function (s) {
        busy = false; if (g !== gen) return;
        if (!s || s.status === "cancelled" || (s.status === "expired" && s.scanned)) { ended = true; fatal("e_expired"); return; }
        if (s.status !== "expired" && fn(s)) ended = true;
      }, function () { busy = false; });
    });
  }
  function scanned() {
    if (S.minor && S.steps.indexOf("p_parent") < 0) S.steps.splice(1, 0, "p_parent");
    var m = frame("p_scan", "");
    m.appendChild(el("div", { cls: "tick", text: "✓" }));
    m.appendChild(el("h2", { cls: "center", text: T("scan_ok") })); say(T("scan_ok"));
    if (!S.minor) { later(1600, decl); return; }
    m.appendChild(el("p", { cls: "lead center", text: T("par_next") })); m.foot(btn(T("cont"), parent, "pri"));
  }
  function parent() {
    var m = frame("p_parent", T("par_title"), { noIdle: true }), g = gen, end = Date.now() + 14 * 60000;
    m.appendChild(el("div", { cls: "qrrow" }, [el("ol", {}, ["par_1", "par_2", "par_3"].map(function (x) { return el("li", { text: T(x) }); })), qrPanel(S.id, S.code, function () { return end; }, leave)]));
    watch(g, function (s) { if (!s.parent) return false; decl(); return true; });
  }
  function decl() {
    var m = frame("p_decl", T("decl_title")), box = el("div", { cls: "decl", tabindex: "0" });
    var doc = new DOMParser().parseFromString(T("decl_html"), "text/html"); Array.prototype.slice.call(doc.body.childNodes).forEach(function (n) { box.appendChild(document.importNode(n, true)); });
    m.appendChild(box);
    var cb = el("input", { type: "checkbox" }); m.appendChild(el("label", { cls: "chk" }, [cb, el("span", { text: T("decl_agree") })]));
    var b = m.foot(btn(T("agree_start"), function () { if (S.kind === "reg") infoName(); else cardIn(); }, "pri")); b.disabled = true;
    cb.addEventListener("change", function () { b.disabled = !cb.checked; });
  }

  /* ------------------------------------------------------------------ particulars (new registration: the card is issued here) */
  function field(label, val) { var i = el("input", { type: "text", value: val || "", autocomplete: "off", spellcheck: "false", inputmode: "none" }); return { box: el("label", { cls: "f" }, [label, i]), i: i }; }
  function infoName() {
    var m = frame("p_info", T("info_name")), d = S.data, a = field(T("surname"), d.sur), b = field(T("given"), d.giv), c = field(T("local"), d.local), err = errBox(), kb = el("div", {}), cur = null, jamo = d.jamo || [];
    c.i.removeAttribute("inputmode"); c.box.className += " wide";
    function focus(f) {
      [a, b, c].forEach(function (x) { x.i.classList.toggle("cur", x === f); }); cur = f;
      if (f === c) {
        if (lang === "zh-hant" || lang === "zh-hans") { kb.innerHTML = ""; return; }   // Chinese: the device's own input method
        window.KKeyboard.build(kb, "ko", { key: function (k) { jamo.push(k); c.i.value = window.KKeyboard.compose(jamo); }, back: function () { jamo.pop(); c.i.value = window.KKeyboard.compose(jamo); } });
      } else window.KKeyboard.build(kb, "en", { key: function (k) { cur.i.value += k; }, back: function () { cur.i.value = cur.i.value.slice(0, -1); } }, T("space"));
    }
    [a, b, c].forEach(function (x) { x.i.addEventListener("focus", function () { focus(x); }); });
    c.i.addEventListener("input", function () { jamo = c.i.value.split(""); });
    [a, b].forEach(function (x) { x.i.addEventListener("input", function () { x.i.value = x.i.value.toUpperCase(); }); });
    m.appendChild(el("div", { cls: "two" }, [a.box, b.box, c.box])); m.appendChild(kb); m.appendChild(err);
    focus(a); a.i.focus();
    m.foot(btn(T("next"), function () {
      var re = /^[A-Z][A-Z '\-]*$/, s = a.i.value.trim().toUpperCase(), g = b.i.value.trim().toUpperCase();
      if (!re.test(s) || !re.test(g)) { err.textContent = T("err_name"); return; }
      d.sur = s; d.giv = g; d.local = c.i.value.trim().slice(0, 20); d.jamo = jamo; infoSex();
    }, "pri"));
  }
  function seg(opts, val, fn) {
    var box = el("div", { cls: "seg" });
    opts.forEach(function (o) { box.appendChild(el("button", { type: "button", cls: o[0] === val ? "on" : "", "data-v": o[0], text: o[1], click: function () { Array.prototype.forEach.call(box.children, function (x) { x.className = x.dataset.v === o[0] ? "on" : ""; }); fn(o[0]); } })); });
    return box;
  }
  function years(v) { var b = new Date(v + "T00:00:00"), n = new Date(), y = n.getFullYear() - b.getFullYear(); return n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? y - 1 : y; }
  function validDob(v) { var x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!x) return false; var t = new Date(+x[1], +x[2] - 1, +x[3]); return t.getMonth() === +x[2] - 1 && t < new Date() && +x[1] > 1900; }
  function infoSex() {
    var m = frame("p_info", T("info_sex"), { back: infoName }), d = S.data, err = errBox(), f = field(T("dob"), d.dob), kb = el("div", {}), digits = (d.dob || "").replace(/\D/g, "");
    m.appendChild(el("p", { cls: "seglab", text: T("sex") })); m.appendChild(seg([["M", T("male")], ["F", T("female")]], d.sex, function (v) { d.sex = v; }));
    m.appendChild(f.box);
    function draw() { f.i.value = digits; }
    f.i.addEventListener("input", function () { digits = f.i.value.replace(/\D/g, "").slice(0, 8); draw(); });
    window.KKeyboard.build(kb, "num", { key: function (k) { if (digits.length < 8) digits += k; draw(); }, back: function () { digits = digits.slice(0, -1); draw(); } });
    m.appendChild(kb); m.appendChild(err);
    m.foot(btn(T("next"), function () {
      var v = digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);   // kept as YYYY-MM-DD
      if (!d.sex) { err.textContent = T("err_sex"); return; }
      if (!validDob(v)) { err.textContent = T("err_dob"); return; }
      var y = years(v); err.textContent = y < 11 ? T("err_11") : !S.minor && y < 18 ? T("err_adult") : S.minor && y >= 18 ? T("err_minor") : "";
      if (err.textContent) return;
      d.dob = v; infoOther();
    }, "pri"));
  }
  function infoOther() {
    var d = S.data, m = frame("p_info", T("info_other"), { back: infoSex }); d.pob = d.pob || "BHG"; d.nat = d.nat || "KOR"; d.res = d.res || "A";
    [["pob", "pob", ["BHG", "KR", "XX"], "pob_"], ["nationality", "nat", ["KOR", "OTH"], "nat_"], ["res", "res", ["A", "R", "U", "C"], "res_"]].forEach(function (x) {
      m.appendChild(el("p", { cls: "seglab", text: T(x[0]) })); m.appendChild(seg(x[2].map(function (v) { return [v, T(x[3] + v)]; }), d[x[1]], function (v) { d[x[1]] = v; }));
    });
    m.foot(btn(T("next"), infoCheck, "pri"));
  }
  function infoCheck() {
    var d = S.data, m = frame("p_info", T("info_check"), { back: infoOther });
    var rows = [["surname", d.sur], ["given", d.giv], ["local", d.local || "–"], ["sex", T(d.sex === "M" ? "male" : "female")], ["dob", d.dob.replace(/-/g, "")], ["pob", T("pob_" + d.pob)], ["nationality", T("nat_" + d.nat)], ["res", T("res_" + d.res)]], dl = el("dl", { cls: "kv" });
    rows.forEach(function (r) { dl.appendChild(el("dt", { text: T(r[0]).replace(/\s*[(（]YYYYMMDD[)）]/, "") })); dl.appendChild(el("dd", { text: r[1] })); });
    m.appendChild(dl); m.foot(btn(T("edit"), infoName)); m.foot(btn(T("confirm"), face, "pri"));
  }

  /* ------------------------------------------------------------------ identity card: the holder's own card goes in and out of the slot */
  function cardVals(a) {
    var n = String(a.name_en).split(",");
    return { idtype: "first", idno: a.id_no, issued: a.card_issued_at || a.created_at, status: a.res_status, kornat: a.nationality === "KOR" ? "KOR" : "OTH", surname: (n[0] || "").trim(), given: (n[1] || "").trim(), local: a.name_local || "",
             sex: a.sex, dob: a.dob, pob: a.pob === "XX" ? "US" : a.pob, chgbirth: "N", chgname: "N", dobproof: "Y", office: "hq" };
  }
  function blank() { return new Promise(function (ok) { var c = el("canvas", { width: 300, height: 380 }), x = c.getContext("2d"); x.fillStyle = "#e4ebe8"; x.fillRect(0, 0, 300, 380); c.toBlob(ok, "image/jpeg"); }); }
  function cardFace(a, photo) {   // -> data URL of the front of the card
    return (photo ? Promise.resolve(photo) : IAS.kiosk.photo(a.account_id)).then(function (b) { return b || blank(); }).then(function (b) { return window.BHGIdCardImages(cardVals(a), b); })
      .then(function (c) { return c.front.toDataURL("image/jpeg", 0.92); });
  }
  /* picture of the slot with the whole card: mode "in" = card waits outside, "out" = the card comes out */
  function bay(m, mode, label, next) {
    var g = gen, done = false, img = el("img", { src: S.face, alt: "" });
    var b = el("button", { type: "button", cls: "bay " + mode, "aria-label": label, click: act }, [el("i", { cls: "l" }), el("i", { cls: "m" }), el("span", { cls: "win" }, [img])]);
    m.appendChild(b); m.foot(btn(label, act, "pri"));
    slot(true, mode, act);
    function act() {
      if (done || g !== gen) return; done = true;
      b.classList.add(mode === "in" ? "gone" : "taken"); $("slot").classList.add(mode === "in" ? "gone" : "taken");
      later(mode === "in" ? 1500 : 800, next);
    }
  }
  function cardIn() {
    var m = frame("p_card", T("card_in"), { back: S.kind === "sus" ? cardNo : null }), g = gen;
    m.appendChild(el("p", { cls: "lead", text: T("card_in2") }));
    if (S.face) { bay(m, "in", T("card_tap"), cardRead); return; }
    var sp = el("div", { cls: "spin" }); m.appendChild(sp);
    cardFace(S.card).then(function (u) { if (g !== gen) return; S.face = u; sp.remove(); bay(m, "in", T("card_tap"), cardRead); }, function () { if (g === gen) fatal("e_load"); });
  }
  function cardNo() {   // without the phone: the number first, then the card of that number
    S.face = S.card = null;
    var m = frame("p_no", T("card_no2"), { back: susIntro }), g = gen, f = field(T("card_no"), S.idno), kb = el("div", {}), err = errBox();
    f.i.setAttribute("placeholder", "A123456(7)"); m.appendChild(f.box); m.appendChild(kb); m.appendChild(err);
    f.i.addEventListener("input", function () { f.i.value = f.i.value.toUpperCase(); });
    window.KKeyboard.build(kb, "id", { key: function (k) { if (f.i.value.length < 11) f.i.value += k; }, back: function () { f.i.value = f.i.value.slice(0, -1); } });
    f.i.focus();
    var ok = m.foot(btn(T("confirm"), function () {
      var x = /^([A-Z]{1,2})(\d{6})\(?([0-9A])\)?$/.exec(f.i.value.replace(/\s/g, "").toUpperCase());
      if (!x) { err.textContent = T("err_card"); return; }
      S.idno = x[1] + x[2] + "(" + x[3] + ")"; ok.disabled = true; err.textContent = "";
      IAS.kiosk.card(S.idno).then(function (r) {
        if (g !== gen) return;
        if (r.error) { ok.disabled = false; err.textContent = T(r.error === "too_many" ? "err_card_many" : "err_card_unknown"); return; }
        S.card = r; S.idno = r.id_no; cardIn();
      }, function () { if (g === gen) { ok.disabled = false; err.textContent = T("e_load"); } });
    }, "pri"));
  }
  function cardRead() {
    var m = frame("p_card", T("card_reading"), { noIdle: true });
    m.appendChild(el("div", { cls: "spin" })); m.appendChild(el("p", { cls: "lead center", text: T("card_reading2") })); slot(true, "held");
    later(3500, function () {
      var m2 = frame("p_card", T("card_ok")); slot(true, "held");
      m2.appendChild(el("div", { cls: "tick", text: "✓" }));
      m2.appendChild(el("dl", { cls: "kv" }, [el("dt", { text: T("card_holder") }), el("dd", { text: S.card.name_en }), el("dt", { text: T("card_no") }), el("dd", { text: S.card.id_no })]));
      m2.foot(btn(T("next"), cardOut, "pri"));
    });
  }
  function cardOut() {
    var m = frame("p_card", T("card_out"), { noExit: true });
    if (S.kind === "reg") SCREEN.querySelectorAll(".rail li").forEach(function (l) { l.className = "ok"; });
    m.appendChild(el("p", { cls: "lead", text: T("card_out2") }));
    bay(m, "out", T("card_taken"), function () { if (S.kind === "sus") susConfirm(); else if (S.kind === "up") face(); else done(); });
  }

  /* ------------------------------------------------------------------ facial recognition */
  var FS = ["front", "left", "right", "final"];
  function face() {
    var m = frame("p_face", T("face_title"), { noIdle: true }), g = gen;
    var video = el("video", { playsinline: true, autoplay: true, muted: true }), box = el("div", { cls: "facebox" }, [video, el("i", {})]), tip = el("p", { cls: "facetip", text: T("face_load") }), dots = el("div", { cls: "dots3" }, FS.map(function () { return el("b", {}); }));
    video.muted = true;
    m.appendChild(box); m.appendChild(tip); m.appendChild(dots); $("machine").classList.add("lit");
    function bad(k) { if (g === gen) faceFail(k); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { bad("need_camera"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false }).then(function (s) {
      if (g !== gen) { s.getTracks().forEach(function (t) { t.stop(); }); return null; }
      stream = s; video.srcObject = s; return window.IASFace.load();
    }).then(function (x) {
      if (g !== gen || x === null) return null;
      var last = "";
      faceRun = window.IASFace.run(video, function (step, hint) {
        if (g !== gen) return;
        var i = FS.indexOf(step), t = hint === "ok" ? T("f_" + step) : T("h_" + hint);
        box.classList.toggle("go", hint === "ok"); Array.prototype.forEach.call(dots.children, function (b, k) { b.className = k < i ? "on" : ""; });
        if (t !== last) { last = t; tip.textContent = t; if (hint === "ok") say(t); }
      });
      return faceRun.done.then(function (res) { faceRun = null; if (g === gen) verify(res); });
    }).catch(function (e) {
      if (e && e.message === "stopped") return;
      bad(e && e.message === "timeout" ? "timeout" : /NotAllowed|NotFound|NotReadable|Permission/i.test((e && e.name || "") + (e && e.message || "")) ? "need_camera" : "error");
    });
  }
  function faceFail(k) {
    var key = /^e_/.test(k) ? k : "e_face_" + k, m = frame("p_face", T(key));
    if (key === "e_expired" || key === "e_too_many" || key === "e_face_already_registered" || key === "e_sus") { m.foot(btn(T("finish"), leave, "pri")); return; }
    if (key === "e_bad_particulars") { m.foot(btn(T("edit"), infoName, "pri")); return; }
    m.appendChild(el("p", { cls: "lead", text: T("face_note") })); m.foot(btn(T("retry"), face, "pri"));
  }
  function verify(res) {
    S.photo = res.blob; S.desc = res.descriptor;
    var url = res.canvas.toDataURL("image/jpeg", 0.85), m = frame("p_face", T("verifying"), { noIdle: true, noExit: true }), g = gen, d = S.data;
    m.appendChild(el("div", { cls: "spin" })); m.appendChild(el("p", { cls: "lead center", text: T("verifying2") }));
    var job = S.kind === "sus" ? IAS.kiosk.suspend(S.idno, res.descriptor).then(function (ok) { return ok ? { ok: true } : { error: "sus" }; })
      : IAS.kiosk.submit(S.id, S.kind === "reg" ? { name_en: d.sur + ", " + d.giv, name_local: d.local, sex: d.sex, dob: d.dob, pob: d.pob, nationality: d.nat, res_status: d.res } : {}, res.descriptor, S.kind === "reg" ? url : "");
    job.then(function (r) {
      S.desc = null; if (g !== gen) return;
      if (r.error) { faceFail({ face_mismatch: "e_face_mismatch", face_already_registered: "e_face_already_registered", sus: "e_sus", too_many: "e_too_many", expired: "e_expired", bad_particulars: "e_bad_particulars" }[r.error] || "error"); return; }
      if (S.kind === "reg") phone(); else { S.finished = true; done(); }
    }, function () { if (g === gen) faceFail("e_load"); });
  }

  /* ------------------------------------------------------------------ continue on the phone, completion */
  function phone() {
    var m = frame("p_bio", T("phone_title"), { noIdle: true, alsoOn: ["p_pin", "p_email"] }), g = gen;
    m.appendChild(el("p", { cls: "lead", text: T("phone_lead") }));
    m.appendChild(el("div", { cls: "qrrow phone3" }, [el("ol", {}, ["phone_bio", "phone_pin", "phone_email"].map(function (x) { return el("li", { text: T(x) }); }))]));
    watch(g, function (s) { if (s.status !== "done" || !s.account) return false; S.finished = true; S.account = S.card = s.account;
      cardFace(s.account, S.photo).then(function (u) { if (g === gen) { S.face = u; cardOut(); } }, function () { if (g === gen) done(); });
      return true; });
  }
  function done() {
    var m = frame("", "", { noExit: true }); SCREEN.querySelectorAll(".rail li").forEach(function (l) { l.className = "ok"; });
    var k = { reg: "done_reg", up: "done_up", sus: "done_sus" }[S.kind];
    m.appendChild(el("div", { cls: "tick", text: "✓" })); m.appendChild(el("h2", { cls: "center", text: T(k) })); say(T(k));
    if (S.kind === "up") m.appendChild(el("p", { cls: "lead center", text: T("done_up2") }));
    if (S.kind === "sus") m.appendChild(el("p", { cls: "lead center", text: T("sus_lead") }));
    if (S.kind === "reg") {
      var a = S.account, ph = S.photo;
      m.appendChild(el("div", { cls: "done" }, [el("div", {}, [S.face ? el("img", { src: S.face, alt: "" }) : null]), el("div", {}, [el("p", { cls: "seglab", text: T("card_no") }), el("p", { cls: "no", text: a.id_no }), el("p", { cls: "lead", text: T("done_card") })])]));
      m.foot(btn(T("print"), function () { window.BHGIdCardPDF(cardVals(a), ph); }));
    }
    m.foot(btn(T("finish"), leave, "pri"));
  }

  /* ------------------------------------------------------------------ suspension */
  function susIntro() { begin("sus"); var m = frame("", T("sus_title")); m.appendChild(el("p", { cls: "lead", text: T("sus_lead") })); m.appendChild(readyList(["ready_card"])); m.foot(btn(T("cont"), cardNo, "red")); }
  function susConfirm() {
    var m = frame("p_confirm", T("sus_confirm"));
    m.appendChild(el("dl", { cls: "kv" }, [el("dt", { text: T("card_no") }), el("dd", { text: S.idno })])); m.appendChild(el("p", { cls: "lead", text: T("sus_lead") }));
    m.foot(btn(T("sus_yes"), face, "red"));
  }

  if (/[?&]full=1/.test(location.search) || document.documentElement.clientWidth < 900) document.body.classList.add("only");
  signs(); fit(); home();
})();
