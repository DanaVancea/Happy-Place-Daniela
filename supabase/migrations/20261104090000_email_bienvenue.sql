-- ============================================================
-- E-mail de bienvenue automatique
-- ============================================================
-- À chaque création d'un compte de connexion (auth.users), un webhook de base de données
-- appelle la fonction Edge « email-bienvenue », qui envoie l'e-mail via Resend.
-- L'appel est asynchrone (pg_net) : s'il échoue, la création du compte réussit quand même.
--
-- AVANT D'EXÉCUTER : remplacer REMPLACER_PAR_LE_SECRET par la même valeur que le secret
-- WEBHOOK_SECRET de la fonction (ne pas committer la vraie valeur).
-- Prérequis : l'extension pg_net doit être active (Database > Extensions).

DROP TRIGGER IF EXISTS email_bienvenue ON auth.users;
CREATE TRIGGER email_bienvenue
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://sfraefdsnopxpfxzdrwb.supabase.co/functions/v1/email-bienvenue',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"REMPLACER_PAR_LE_SECRET"}',
    '{}',
    '5000'
  );
