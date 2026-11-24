(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  /* menu */
  var b = $(".burger"), m = $("#menu");
  if (b) {
    b.addEventListener("click", function () { m.hidden = false; b.setAttribute("aria-expanded", "true"); });
    $(".mclose").addEventListener("click", function () { m.hidden = true; b.setAttribute("aria-expanded", "false"); });
  }
  /* slider */
  var slides = $$(".slide"), dots = $$(".dots button"), cur = 0, auto;
  function show(n) { cur = (n + slides.length) % slides.length; slides.forEach(function (s, k) { s.classList.toggle("on", k === cur); }); dots.forEach(function (d, k) { d.classList.toggle("on", k === cur); }); }
  if (slides.length) {
    $(".prev").addEventListener("click", function () { show(cur - 1); });
    $(".nextb").addEventListener("click", function () { show(cur + 1); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { show(k); }); });
    auto = setInterval(function () { show(cur + 1); }, 6000);
  }
  /* FAQ */
  $$(".faq .q").forEach(function (q) { q.addEventListener("click", function () { var o = q.getAttribute("aria-expanded") === "true"; q.setAttribute("aria-expanded", String(!o)); q.nextElementSibling.hidden = o; }); });
  $$("[data-faq]").forEach(function (x) { x.addEventListener("click", function () { var o = x.getAttribute("data-faq") === "open"; $$(".faq .q").forEach(function (q) { q.setAttribute("aria-expanded", String(o)); q.nextElementSibling.hidden = !o; }); }); });
  /* statistics from the iAM Smart backend */
  var st = $(".stats");
  if (st && window.IAS) {
    window.IAS.stats().then(function (s) {
      function f(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
      $("[data-stat=regs]").textContent = f(s.regs); $("[data-stat=uses]").textContent = f(s.uses); $("[data-stat=svcs]").textContent = f(+st.getAttribute("data-svcs"));
    }).catch(function () { /* backend not reachable */ });
  }
  /* QR code of the app on the download page */
  var q = $("[data-qr=app]");
  if (q && window.qrcode) {
    var link = $(".dl .cta").href, qq = window.qrcode(0, "M"); qq.addData(link); qq.make();
    var n = qq.getModuleCount(), c = document.createElement("canvas"), s = 480, k = s / (n + 8); c.width = c.height = s;
    var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, s, s); x.fillStyle = "#111";
    for (var r = 0; r < n; r++) for (var j = 0; j < n; j++) if (qq.isDark(r, j)) x.fillRect(Math.floor((j + 4) * k), Math.floor((r + 4) * k), Math.ceil(k), Math.ceil(k));
    q.appendChild(c);
  }
})();
