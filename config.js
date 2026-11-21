// Datele de conectare Supabase (Project Settings → API).
// Cheia "anon public" este sigură în browser DOAR cu RLS activat pe tabele.
// NU pune NICIODATĂ aici cheia "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: "https://rehdrjmfllonrqevwltn.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qBsDOIfF8-k-RBgYGGXuUg_O49bce3W",
  REQUIRE_2FA: false   // true = cere și codul din e-mail; false = doar e-mail + parolă
};
