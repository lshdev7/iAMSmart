/* iAM Smart – backend selection.
   "local"    : everything is kept in this browser (IndexedDB). Works on GitHub Pages and on dev/serve.py because
                GovBHG, the Immigration Department site and iAM Smart are served from the same origin.
   "supabase" : Supabase project (supabase/schema.sql). Used only when anonKey is filled in; until then the
                local backend is used so that the sites keep working. */
window.IAS_CONFIG = {
  backend: "supabase",
  supabase: { url: "https://nibiyyqhwhrcghodugkn.supabase.co",
              anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pYml5eXFod2hyY2dob2R1Z2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MDA2MjgsImV4cCI6MjExMTA3NjYyOH0.pokF8Q7OM6dM19LBL_jG7qw-i0QnnWaEmAiI3O4WmYc" },   // anonKey = publishable (anon) key
  appPath: "/iAMSmart/app/",           // root-relative URL of the iAM Smart app
  requestTTL: 90,                          // seconds a login / form-filling / signing request stays valid
  pinMaxFail: 10                           // consecutive wrong passwords before the account becomes invalid
};
