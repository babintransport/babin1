// Datele de conectare Supabase (Project Settings → API).
// Cheia "anon public" este sigură în browser DOAR cu RLS activat pe tabele.
// NU pune NICIODATĂ aici cheia "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: "https://XXXX.supabase.co",
  SUPABASE_ANON_KEY: "XXXX",
  REQUIRE_2FA: false   // true = cere și codul din e-mail; false = doar e-mail + parolă
};
