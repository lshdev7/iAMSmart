/* iAM Smart – API facade. Pages load: config.js, adapter-local.js, adapter-supabase.js, then this file, and call
   window.IAS.* only. Switching backend = changing IAS_CONFIG.backend; no page code changes. */
(function () {
  "use strict";
  var cfg = window.IAS_CONFIG || { backend: "local" };
  var A = (window.IAS_ADAPTERS || {})[cfg.backend];
  if (!A) throw new Error("iAM Smart adapter not loaded: " + cfg.backend);
  var IAS = Object.create(A);

  /* WebAuthn platform authenticator = the phone's built-in biometric authentication */
  IAS.bio = {
    available: function () {
      if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
      return Promise.race([
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; }),
        new Promise(function (ok) { setTimeout(function () { ok(false); }, 1500); })
      ]);
    },
    create: function (name) {
      var ch = new Uint8Array(32), uid = new Uint8Array(16); crypto.getRandomValues(ch); crypto.getRandomValues(uid);
      return navigator.credentials.create({ publicKey: {
        challenge: ch, rp: { name: "iAM Smart" }, user: { id: uid, name: name, displayName: name },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" }, timeout: 60000
      } }).then(function (c) { return btoa(String.fromCharCode.apply(null, new Uint8Array(c.rawId))); });
    },
    verify: function (credId) {
      var ch = new Uint8Array(32); crypto.getRandomValues(ch);
      var raw = Uint8Array.from(atob(credId), function (c) { return c.charCodeAt(0); });
      return navigator.credentials.get({ publicKey: { challenge: ch, allowCredentials: [{ type: "public-key", id: raw }], userVerification: "required", timeout: 60000 } })
        .then(function () { return true; });
    }
  };
  IAS.config = cfg;
  window.IAS = IAS;
})();
