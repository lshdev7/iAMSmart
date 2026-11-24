/* iAM Smart – client for online services (GovBHG, Immigration Department).
   Usage: <script src="/iAMSmart/lib/ias-client.js" data-client="govbhg" data-client-name="GovBHG"></script>
   IASClient.loginButton(el, {onChange})   – "Login with iAM Smart" button / logged-in badge
   IASClient.request("eme", scope) -> Promise(result)   – "e-ME" form filling
   IASClient.request("sign", [], digest) -> Promise(result) – digital signing (iAM Smart+)
   IASClient.session() / IASClient.logout() */
(function () {
  "use strict";
  var me = document.currentScript, BASE = me.src.replace(/[^\/]*$/, "");
  var CLIENT = me.getAttribute("data-client") || location.pathname.split("/")[1] || "service";
  var CLIENT_NAME = me.getAttribute("data-client-name") || document.title;
  var L = (document.documentElement.lang || "en").toLowerCase();
  var LG = L.indexOf("ko") === 0 ? 1 : (L === "zh-hans" || L === "zh-cn") ? 3 : L.indexOf("zh") === 0 ? 2 : 0;
  var TXT = {
    login: ["Login with “iAM Smart”", "\"iAM Smart\"로 로그인", "以「智方便」登入", "以「智方便」登入"],
    fill: ["Fill in with “iAM Smart”", "\"iAM Smart\"로 자동 작성", "以「智方便」填表", "以「智方便」填表"],
    sign: ["Sign with “iAM Smart+”", "\"iAM Smart+\"로 서명", "以「智方便+」簽署", "以「智方便+」签署"],
    step1: ["Open the “iAM Smart” app on your phone", "휴대폰에서 \"iAM Smart\" 앱을 여세요", "在手機開啟「智方便」應用程式", "在手机开启「智方便」应用程式"],
    step2: ["Tap “Scan” and scan this QR code", "\"스캔\"을 눌러 이 QR 코드를 스캔하세요", "按「掃描」並掃描此二維碼", "按「扫描」并扫描此二维码"],
    step3: ["Confirm in the app with biometric authentication or your password", "앱에서 생체 인증이나 비밀번호로 확인하세요", "在應用程式以生物認證或密碼確認", "在应用程式以生物认证或密码确认"],
    code: ["Code", "코드", "編碼", "编码"],
    same: ["Open “iAM Smart” on this device", "이 기기에서 \"iAM Smart\" 열기", "在此裝置開啟「智方便」", "在此装置开启「智方便」"],
    left: ["Valid for {n} seconds", "{n}초 동안 유효", "有效時間尚餘{n}秒", "有效时间尚余{n}秒"],
    expired: ["The request has expired.", "요청이 만료되었습니다.", "請求已失效。", "请求已失效。"],
    rejected: ["The request was rejected in the app.", "앱에서 요청을 거절했습니다.", "請求已在應用程式內被拒絕。", "请求已在应用程式内被拒绝。"],
    retry: ["Try again", "다시 시도", "再試", "再试"], cancel: ["Cancel", "취소", "取消", "取消"],
    hello: ["Logged in: {n}", "로그인: {n}", "已登入：{n}", "已登入：{n}"], logout: ["Logout", "로그아웃", "登出", "登出"],
    hash: ["Hash code", "해시 코드", "雜湊編碼", "杂凑编码"]
  };
  function t(k, n) { return TXT[k][LG].replace("{n}", n); }
  var LOGO = '<svg viewBox="0 0 40 52" width="18" height="24" aria-hidden="true"><rect x="5" y="3" width="28" height="46" rx="5" transform="rotate(-8 19 26)" fill="#fff" stroke="#1f6f6a" stroke-width="3"/><rect x="10" y="9" width="18" height="30" rx="2" transform="rotate(-8 19 26)" fill="#3aa79b"/><circle cx="19" cy="21" r="4" fill="#fff"/><path d="M12 33c2-5 12-6 14 0" fill="#fff"/><rect x="0" y="0" width="4" height="4" fill="#f2a33a"/><rect x="5" y="-1" width="3" height="3" fill="#3d8fd6"/></svg>';

  /* ---------------------------------------------------------------- load the API (config, adapters, facade, QR) */
  var SBJS = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js", "sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug"];
  function load(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad;
      if (src === SBJS[0]) { s.integrity = SBJS[1]; s.crossOrigin = "anonymous"; }
      document.head.appendChild(s);
    });
  }
  var ready = (window.IAS ? Promise.resolve() : load(BASE + "config.js").then(function () {
        var c = window.IAS_CONFIG || {}, need = c.backend === "supabase" && c.supabase && c.supabase.anonKey && !window.supabase;
        return need ? load(SBJS[0]).catch(function () { /* fall back to the local backend */ }) : null;
      }).then(function () { return ["adapter-local.js", "adapter-supabase.js", "ias-api.js"].reduce(function (p, f) { return p.then(function () { return load(BASE + f); }); }, Promise.resolve()); }))
    .then(function () { return window.qrcode ? null : load(BASE + "qrcode.js"); });

  var css = ".ias-btn{display:inline-flex;align-items:center;gap:8px;background:#2b8a83;color:#fff!important;border:0;border-radius:4px;padding:7px 14px;font:600 14px/1.2 Arial,Helvetica,sans-serif;cursor:pointer;text-decoration:none!important}"
    + ".ias-btn:hover{background:#21706a}.ias-btn svg{background:#fff;border-radius:3px;padding:1px}"
    + ".ias-me{display:inline-flex;align-items:center;gap:8px;font:14px Arial,Helvetica,sans-serif}.ias-me button{background:none;border:1px solid #2b8a83;color:#2b8a83;border-radius:4px;padding:3px 10px;cursor:pointer}"
    + ".ias-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}"
    + ".ias-dlg{background:#fff;border-radius:10px;max-width:420px;width:100%;padding:22px 24px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#222;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.3)}"
    + ".ias-dlg h2{font-size:19px;margin:0 0 12px;color:#1f6f6a;display:flex;align-items:center;justify-content:center;gap:8px}.ias-dlg canvas{width:220px;height:220px;border:1px solid #ddd}"
    + ".ias-dlg ol{text-align:left;margin:12px 0 8px 20px;padding:0}.ias-dlg .ias-code{font:700 22px monospace;letter-spacing:4px;color:#1f6f6a}.ias-dlg .ias-left{color:#666;font-size:13px}"
    + ".ias-dlg .ias-row{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}.ias-dlg .ias-sec{background:#eee;color:#333;border:0;border-radius:4px;padding:8px 16px;cursor:pointer}"
    + ".ias-dlg .ias-err{color:#b00020;font-weight:700}.ias-fill{margin:0 0 14px}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function sessKey() { return "ias-session-" + CLIENT; }
  function session() { try { return JSON.parse(sessionStorage.getItem(sessKey()) || "null"); } catch (e) { return null; } }
  function setSession(s) { try { if (s) sessionStorage.setItem(sessKey(), JSON.stringify(s)); else sessionStorage.removeItem(sessKey()); } catch (e) { /* ignore */ } }
  function maskName(n) { var p = String(n || "").split(","); var g = (p[1] || "").trim().split(/\s+/).filter(Boolean); return (p[0] || "").trim() + (g.length ? " " + g.map(function (x) { return x[0] + "**"; }).join(" ") : ""); }

  function qr(text) {
    var q = window.qrcode(0, "M"); q.addData(unescape(encodeURIComponent(text)), "Byte"); q.make();
    var n = q.getModuleCount(), c = document.createElement("canvas"), s = 440, m = s / (n + 8); c.width = c.height = s;
    var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, s, s); x.fillStyle = "#111";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(Math.floor((k + 4) * m), Math.floor((r + 4) * m), Math.ceil(m), Math.ceil(m));
    return c;
  }

  /* ---------------------------------------------------------------- one request = one dialog */
  function request(purpose, scope, digest) {
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var ov = document.createElement("div"), dlg = document.createElement("div"), poll = null, tick = null;
        ov.className = "ias-ov"; dlg.className = "ias-dlg"; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true");
        ov.appendChild(dlg); document.body.appendChild(ov);
        function close() { clearInterval(poll); clearInterval(tick); ov.remove(); }
        function start() {
          clearInterval(poll); clearInterval(tick);
          IAS.createRequest({ client: CLIENT, client_name: CLIENT_NAME, purpose: purpose, scope: scope || [], digest: digest || "" }).then(function (r) {
            var url = location.origin + IAS.config.appPath + "?lang=" + encodeURIComponent(L) + "#/auth/" + r.id;
            dlg.innerHTML = "";
            var h = document.createElement("h2"); h.innerHTML = LOGO; h.appendChild(document.createTextNode(t(purpose === "login" ? "login" : purpose === "eme" ? "fill" : "sign"))); dlg.appendChild(h);
            dlg.appendChild(qr(url));
            var code = document.createElement("p"); code.innerHTML = t("code") + ': <span class="ias-code"></span>'; code.lastChild.textContent = r.code; dlg.appendChild(code);
            if (purpose === "sign") { var hp = document.createElement("p"); hp.innerHTML = t("hash") + ': <span class="ias-code"></span>'; hp.lastChild.textContent = digest.slice(0, 4).toUpperCase(); dlg.appendChild(hp); }
            var ol = document.createElement("ol"); ["step1", "step2", "step3"].forEach(function (k) { var li = document.createElement("li"); li.textContent = t(k); ol.appendChild(li); }); dlg.appendChild(ol);
            var left = document.createElement("p"); left.className = "ias-left"; dlg.appendChild(left);
            var row = document.createElement("div"); row.className = "ias-row";
            var same = document.createElement("a"); same.className = "ias-btn"; same.href = url; same.target = "_blank"; same.rel = "opener"; same.innerHTML = LOGO; same.appendChild(document.createTextNode(t("same")));
            var cx = document.createElement("button"); cx.type = "button"; cx.className = "ias-sec"; cx.textContent = t("cancel");
            cx.addEventListener("click", function () { close(); reject(new Error("cancelled")); });
            row.appendChild(same); row.appendChild(cx); dlg.appendChild(row);
            var end = Date.parse(r.expires_at);
            function upd() { var s = Math.max(0, Math.round((end - Date.now()) / 1000)); left.textContent = t("left", s); }
            upd(); tick = setInterval(upd, 1000);
            poll = setInterval(function () {
              IAS.poll(r.id, r.secret).then(function (p) {
                if (p.status === "approved") { close(); resolve(p.result); }
                else if (p.status === "rejected" || p.status === "expired" || (p.status === "pending" && Date.now() > end)) {
                  clearInterval(poll); clearInterval(tick);
                  var msg = document.createElement("p"); msg.className = "ias-err"; msg.textContent = t(p.status === "rejected" ? "rejected" : "expired");
                  var again = document.createElement("button"); again.type = "button"; again.className = "ias-btn"; again.textContent = t("retry"); again.addEventListener("click", start);
                  dlg.insertBefore(msg, row); row.insertBefore(again, row.firstChild); same.remove();
                }
              });
            }, 1000);
          });
        }
        start();
      });
    });
  }

  function loginButton(host, opts) {
    opts = opts || {};
    function draw() {
      host.innerHTML = "";
      var s = session();
      if (s) {
        var w = document.createElement("span"); w.className = "ias-me"; w.innerHTML = LOGO;
        w.appendChild(document.createTextNode(t("hello", maskName(s.name_en))));
        var b = document.createElement("button"); b.type = "button"; b.textContent = t("logout");
        b.addEventListener("click", function () { setSession(null); draw(); if (opts.onChange) opts.onChange(null); });
        w.appendChild(b); host.appendChild(w);
      } else {
        var a = document.createElement("button"); a.type = "button"; a.className = "ias-btn"; a.innerHTML = LOGO; a.appendChild(document.createTextNode(t("login")));
        a.addEventListener("click", function () {
          request("login", ["name_en"]).then(function (res) { setSession({ sub: res.sub, name_en: res.name_en, version: res.version, at: new Date().toISOString() }); draw(); if (opts.onChange) opts.onChange(session()); }, function () { /* cancelled */ });
        });
        host.appendChild(a);
      }
    }
    draw();
  }

  window.IASClient = { ready: ready, request: request, loginButton: loginButton, session: session, logout: function () { setSession(null); }, logo: LOGO, text: t };
})();
