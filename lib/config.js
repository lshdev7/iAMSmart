/* iAM Smart – backend selection.
   "local"    : everything is kept in this browser (IndexedDB). Works on GitHub Pages and on dev/serve.py because
                GovBHG, the Immigration Department site and iAM Smart are served from the same origin.
   "supabase" : run supabase/schema.sql on your project, fill in url + anonKey below and load
                https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js before lib/ias-api.js. */
window.IAS_CONFIG = {
  backend: "local",
  supabase: { url: "", anonKey: "" },
  appPath: "/bhg_iAMSmart/app/",           // root-relative URL of the iAM Smart app
  requestTTL: 90,                          // seconds a login / form-filling / signing request stays valid
  pinMaxFail: 10                           // consecutive wrong passwords before the account becomes invalid
};
