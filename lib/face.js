/* iAM Smart – facial identification with liveness detection (face-api, MIT licence, lib/faceapi/).
   IASFace.run(video, onStatus) only resolves when a live face has looked straight at the camera, turned left,
   turned right and looked straight again; it then returns the identity-card photograph (cropped around the face) and the
   128-value face descriptor that is compared on the server for "same person" checks. */
(function () {
  "use strict";
  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, "") : "/iAMSmart/lib/"; })();
  var MODEL = BASE + "faceapi/model/";
  var loading = null, listeners = [], pct = -1;

  /* the files that are downloaded, with their (uncompressed) sizes, so that the progress can be shown in per cent;
     if a file is replaced and its size changes, the figure is only approximate and never passes 99 before the end */
  var FILES = { "face-api.js": 1333943, tiny_face_detector_model: 193321, face_landmark_68_model: 356840, face_recognition_model: 6444032 };
  var got = {};
  function progress(name, n) {
    got[name] = n;
    var total = 0, sum = 0;
    Object.keys(FILES).forEach(function (k) { total += FILES[k]; sum += Math.min(got[k] || 0, FILES[k]); });
    var p = Math.min(99, Math.floor(sum * 100 / total));
    if (p !== pct) { pct = p; listeners.forEach(function (f) { try { f(p); } catch (e) { /* ignore */ } }); }
  }
  /* fetch with progress; resolves with an ArrayBuffer */
  function fetchBytes(url, name) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("load " + r.status);
      if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (b) { progress(name, b.byteLength); return b; });
      var reader = r.body.getReader(), parts = [], n = 0;
      return (function pump() {
        return reader.read().then(function (x) {
          if (x.done) {
            var out = new Uint8Array(n), o = 0;
            parts.forEach(function (p) { out.set(p, o); o += p.length; });
            progress(name, FILES[name] || n);
            return out.buffer;
          }
          parts.push(x.value); n += x.value.length; progress(name, n);
          return pump();
        });
      })();
    });
  }
  /* downloads a model (manifest and weights); the weights are decoded later, once the backend is ready */
  function fetchNet(name) {
    return fetch(MODEL + name + "-weights_manifest.json").then(function (r) { if (!r.ok) throw new Error("load " + r.status); return r.json(); }).then(function (manifest) {
      var specs = [], paths = [];
      manifest.forEach(function (g) { specs = specs.concat(g.weights); paths = paths.concat(g.paths); });
      return Promise.all(paths.map(function (p) { return fetchBytes(MODEL + p, name); })).then(function (bufs) {
        var all = new Uint8Array(bufs.reduce(function (s, b) { return s + b.byteLength; }, 0)), o = 0;
        bufs.forEach(function (b) { all.set(new Uint8Array(b), o); o += b.byteLength; });
        return { specs: specs, data: all.buffer };
      });
    });
  }
  function loadScript() {
    if (window.faceapi) { progress("face-api.js", FILES["face-api.js"]); return Promise.resolve(); }
    return fetchBytes(BASE + "faceapi/face-api.js", "face-api.js").then(function (b) {
      var s = document.createElement("script");
      s.text = new TextDecoder().decode(b);
      document.head.appendChild(s);
      if (!window.faceapi) throw new Error("face-api");
    });
  }
  /* IASFace.load(onProgress): onProgress(per cent 0-100) is called while the facial recognition files are downloaded */
  function load(onProgress) {
    if (onProgress) { listeners.push(onProgress); if (pct >= 0) onProgress(pct); }
    if (!loading) {
      got = {}; pct = -1; progress("", 0);
      var NETS = [["tinyFaceDetector", "tiny_face_detector_model"], ["faceLandmark68Net", "face_landmark_68_model"], ["faceRecognitionNet", "face_recognition_model"]];
      // everything is downloaded at the same time
      var weights = Promise.all(NETS.map(function (x) { return fetchNet(x[1]); }));
      loading = Promise.all([loadScript(), weights]).then(function (x) {
        // GPU (WebGL) when available, otherwise plain JavaScript; the WASM backend would need extra binaries
        var tf = window.faceapi.tf;
        return tf.setBackend("webgl").catch(function () { return false; }).then(function (ok) { return ok ? true : tf.setBackend("cpu"); }).then(function () { return tf.ready(); }).then(function () {
          NETS.forEach(function (n, i) { window.faceapi.nets[n[0]].loadFromWeightMap(tf.io.decodeWeights(x[1][i].data, x[1][i].specs)); });
        });
      }).then(function () {
        pct = 100; listeners.forEach(function (f) { try { f(100); } catch (e) { /* ignore */ } });
      });
      loading.catch(function () { loading = null; });
    }
    var p = loading;
    if (onProgress) p.then(function () { listeners = listeners.filter(function (f) { return f !== onProgress; }); }, function () { listeners = listeners.filter(function (f) { return f !== onProgress; }); });
    return p;
  }
  function opt() { return new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }); }
  function measure(det, w, h) {
    var lm = det.landmarks.positions, box = det.detection.box, jl = lm[0], jr = lm[16], nose = lm[30];
    return {
      yaw: (nose.x - jl.x) / Math.max(1, jr.x - jl.x),        // 0.5 = straight; > 0.5 = turned to the person's left
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

  /* onStatus(stepKey, hintKey): steps "front" -> "left" -> "right" -> "final"; hints: no_face / many / closer / farther / center / ok */
  function run(video, onStatus) {
    var stopped = false, step = "front", hold = 0, t0 = Date.now();
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
              if (m.yaw > 0.4 && m.yaw < 0.6) hold++; else hold = 0;
              if (hold >= 4) { step = "left"; hold = 0; }
            } else if (step === "left") {
              if (m.yaw > 0.66) step = "right";
            } else if (step === "right") {
              if (m.yaw < 0.34) step = "final";
            } else if (step === "final") {
              // a few steady frames, so that the photograph is not taken while the head is still moving
              if (m.yaw > 0.42 && m.yaw < 0.58) hold++; else hold = 0;
              if (hold >= 3) {
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
