/* On-screen keyboard of the kiosk: English letters, digits, identity card numbers and Hangul (two-set layout). */
(function () {
  "use strict";
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ",
      JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  var VV = { "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ" };
  var CC = { "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ" };
  /* typed jamo -> syllables */
  function compose(keys) {
    var out = "", c = "", v = "", t = "";
    function flush() { if (c && v) out += String.fromCharCode(0xAC00 + (CHO.indexOf(c) * 21 + JUNG.indexOf(v)) * 28 + JONG.indexOf(t)); else out += c + v; c = v = t = ""; }
    function split(x) { var k = Object.keys(CC).filter(function (q) { return CC[q] === x; })[0]; return k ? [k[0], k[1]] : ["", x]; }
    Array.prototype.forEach.call(keys, function (k) {
      if (JUNG.indexOf(k) >= 0) {
        if (t) { var s = split(t), n = s[1]; t = s[0]; flush(); c = n; v = k; }
        else if (v && VV[v + k]) v = VV[v + k];
        else if (v) { flush(); v = k; }
        else v = k;
      } else if (CHO.indexOf(k) >= 0) {
        if (c && v) {
          if (!t && JONG.indexOf(k) > 0) t = k;
          else if (t && CC[t + k]) t = CC[t + k];
          else { flush(); c = k; }
        } else { flush(); c = k; }
      } else { flush(); out += k; }
    });
    flush();
    return out;
  }
  var ROWS = {
    en: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM'-"], num: ["123", "456", "789", "0"], id: ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM()"],
    ko: ["ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ", "ㅁㄴㅇㄹㅎㅗㅓㅏㅣ", "ㅋㅌㅊㅍㅠㅜㅡ"], kos: ["ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖ", "ㅁㄴㅇㄹㅎㅗㅓㅏㅣ", "ㅋㅌㅊㅍㅠㅜㅡ"]
  };
  /* keyboard(host, layout, {key(ch), back(), space}) */
  function build(host, layout, cb, spaceText) {
    var shift = false;
    function b(t, cls, fn) { var e = document.createElement("button"); e.type = "button"; e.className = "kk " + (cls || ""); e.textContent = t; e.tabIndex = -1; e.addEventListener("mousedown", function (ev) { ev.preventDefault(); }); e.addEventListener("click", fn); return e; }
    function draw() {
      host.innerHTML = ""; host.className = "kbd k-" + layout;
      var rows = ROWS[layout === "ko" && shift ? "kos" : layout];
      rows.forEach(function (r, i) {
        var d = document.createElement("div"); d.className = "kr";
        if (layout === "ko" && i === 2) d.appendChild(b("⇧", shift ? "fn on" : "fn", function () { shift = !shift; draw(); }));
        r.split("").forEach(function (ch) { d.appendChild(b(ch, "", function () { cb.key(ch); if (shift) { shift = false; draw(); } })); });
        if (i === rows.length - 1) d.appendChild(b("⌫", "fn", cb.back));
        host.appendChild(d);
      });
      if (layout === "en") { var d2 = document.createElement("div"); d2.className = "kr"; d2.appendChild(b(spaceText || " ", "sp", function () { cb.key(" "); })); host.appendChild(d2); }
    }
    draw();
  }
  window.KKeyboard = { build: build, compose: compose };
})();
