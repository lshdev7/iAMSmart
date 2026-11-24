/* iAM Smart – facial identification with liveness detection (face-api, MIT licence, lib/faceapi/).
   IASFace.run(video, onStatus) only resolves when a live face has looked straight at the camera, turned left,
   turned right and blinked; it then returns the identity-card photograph (cropped around the face) and the
   128-value face descriptor that is compared on the server for "same person" checks. */
(function () {
  "use strict";
  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, "") : "/iAMSmart/lib/"; })();
  var MODEL = BASE + "faceapi/model/";
  var loading = null;

  function loadScript(src) { return new Promise(function (ok, bad) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
  function load() {
    if (!loading) {
      loading = (window.faceapi ? Promise.resolve() : loadScript(BASE + "faceapi/face-api.js")).then(function () {
        // GPU (WebGL) when available, otherwise plain JavaScript; the WASM backend would need extra binaries
        var tf = window.faceapi.tf;
        return tf.setBackend("webgl").catch(function () { return false; }).then(function (ok) { return ok ? true : tf.setBackend("cpu"); }).then(function () { return tf.ready(); });
      }).then(function () {
        var n = window.faceapi.nets;
        return Promise.all([n.tinyFaceDetector.loadFromUri(MODEL), n.faceLandmark68Net.loadFromUri(MODEL), n.faceRecognitionNet.loadFromUri(MODEL)]);
      });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }
  function opt() { return new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function ear(p) { return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3])); }   // eye aspect ratio
  function measure(det, w, h) {
    var lm = det.landmarks.positions, box = det.detection.box, jl = lm[0], jr = lm[16], nose = lm[30];
    return {
      yaw: (nose.x - jl.x) / Math.max(1, jr.x - jl.x),        // 0.5 = straight; > 0.5 = turned to the person's left
      ear: (ear(lm.slice(36, 42)) + ear(lm.slice(42, 48))) / 2,
      size: box.width / w, cx: (box.x + box.width / 2) / w, cy: (box.y + box.height / 2) / h, box: box
    };
  }
  /* identity-card photograph: 4:5 crop around the face, not mirrored */
  function cardPhoto(video, box) {
    var vw = video.videoWidth, vh = video.videoHeight, cw = Math.min(vw, box.width * 2.1), ch = Math.min(vh, cw * 1.25);
    cw = ch / 1.25;
    var x = Math.max(0, Math.min(vw - cw, box.x + box.width / 2 - cw / 2)), y = Math.max(0, Math.min(vh - ch, box.y + box.height * 0.42 - ch / 2));
    var c = document.createElement("canvas"); c.width = 640; c.height = 800;
    c.getContext("2d").drawImage(video, x, y, cw, ch, 0, 0, 640, 800);
    return c;
  }
  function frame(video) { var c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext("2d").drawImage(video, 0, 0); return c; }

  /* onStatus(stepKey, hintKey): steps "front" -> "left" -> "right" -> "blink" -> "final"; hints: no_face / many / closer / farther / center / ok */
  function run(video, onStatus) {
    var stopped = false, step = "front", hold = 0, base = 0, closed = false, t0 = Date.now();
    var api = { stop: function () { stopped = true; } };
    api.done = load().then(function () {
      return new Promise(function (resolve, reject) {
        function tick() {
          if (stopped) return reject(new Error("stopped"));
          if (Date.now() - t0 > 90000) return reject(new Error("timeout"));
          if (!video.videoWidth) return setTimeout(tick, 200);
          F.detectAll(video).then(function (dets) {
            if (stopped) return reject(new Error("stopped"));
            var hint = "ok", m = null;
            if (!dets.length) hint = "no_face";
            else if (dets.length > 1) hint = "many";
            else {
              m = measure(dets[0], video.videoWidth, video.videoHeight);
              if (m.size < 0.2) hint = "closer"; else if (m.size > 0.75) hint = "farther";
              else if (Math.abs(m.cx - 0.5) > 0.22 || Math.abs(m.cy - 0.5) > 0.28) hint = "center";
            }
            if (hint !== "ok") { hold = 0; onStatus(step, hint); return setTimeout(tick, 120); }
            if (step === "front") {
              if (m.yaw > 0.4 && m.yaw < 0.6) { hold++; base = base ? base * 0.7 + m.ear * 0.3 : m.ear; } else hold = 0;
              if (hold >= 4) step = "left";
            } else if (step === "left") {
              if (m.yaw > 0.66) step = "right";
            } else if (step === "right") {
              if (m.yaw < 0.34) step = "blink";
            } else if (step === "blink") {
              if (m.yaw > 0.38 && m.yaw < 0.62) {
                if (!closed && m.ear < Math.min(0.21, base * 0.7)) closed = true;
                else if (closed && m.ear > base * 0.85) step = "final";
              }
            } else if (step === "final") {
              if (m.yaw > 0.42 && m.yaw < 0.58 && m.ear > base * 0.8) {
                var photo = cardPhoto(video, m.box), still = frame(video);
                return F.detectOne(still).then(function (d) {
                  if (!d) return setTimeout(tick, 120);
                  photo.toBlob(function (blob) { resolve({ blob: blob, descriptor: Array.prototype.slice.call(d.descriptor), canvas: photo }); }, "image/jpeg", 0.9);
                });
              }
            }
            onStatus(step, "ok");
            setTimeout(tick, 100);
          }, function (e) { reject(e); });
        }
        tick();
      });
    });
    return api;
  }

  /* descriptor of a still image (used by tests and by server-less checks) */
  function describe(img) {
    return load().then(function () { return F.detectOne(img); })
      .then(function (d) { return d ? Array.prototype.slice.call(d.descriptor) : null; });
  }
  function distance(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s); }

  var F = window.IASFace = {
    load: load, run: run, describe: describe, distance: distance, MATCH: 0.55, DUPLICATE: 0.5,
    /* detectors (replaceable, e.g. by automated tests that cannot put a real person in front of a camera) */
    detectAll: function (input) { return window.faceapi.detectAllFaces(input, opt()).withFaceLandmarks(); },
    detectOne: function (input) { return window.faceapi.detectSingleFace(input, opt()).withFaceLandmarks().withFaceDescriptor(); }
  };
})();
