-- ============================================================
-- E-mail de bienvenue automatique
-- ============================================================
-- À chaque création d'un compte de connexion (auth.users), on appelle la fonction Edge
-- « email-bienvenue », qui envoie l'e-mail via Resend.
-- L'appel est asynchrone (pg_net) et protégé par try/catch : s'il échoue,
-- la création du compte réussit quand même.
--
-- AVANT D'EXÉCUTER : remplacer REMPLACER_PAR_LE_SECRET par la même valeur que le secret
-- WEBHOOK_SECRET de la fonction (ne pas committer la vraie valeur).
-- Prérequis : l'extension pg_net doit être active (Database > Extensions).

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.notifier_email_bienvenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://sfraefdsnopxpfxzdrwb.supabase.co/functions/v1/email-bienvenue',
      headers := '{"Content-Type":"application/json","x-webhook-secret":"REMPLACER_PAR_LE_SECRET"}'::jsonb,
      body := jsonb_build_object('type', 'INSERT', 'record', jsonb_build_object('id', NEW.id, 'email', NEW.email)),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'email-bienvenue : appel impossible (%)', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notifier_email_bienvenue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS email_bienvenue ON auth.users;
CREATE TRIGGER email_bienvenue
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.notifier_email_bienvenue();
