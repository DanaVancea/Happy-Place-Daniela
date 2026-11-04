-- ============================================================
-- E-mail à l'auteur quand le statut de son idée change
-- ============================================================
-- Règles proposées à Daniela (4 novembre 2026) :
--   * un mail à l'auteur à chaque changement de statut (validée, en débat, remontée, supprimée) :
--     ancien statut, nouveau statut, début du texte de l'idée, nom de la personne qui a décidé,
--     motif (si supprimée) ou note (si remontée) et lien vers la Boîte à idées ;
--   * pas de mail si l'auteur change lui-même le statut de sa propre idée (manager/admin) ;
--   * pas de mail si l'auteur n'est plus dans la liste des comptes autorisés, ou si sa date de départ est passée ;
--   * changements en rafale (A → B puis B → C en quelques secondes) : un seul mail « A → C »,
--     grâce à la colonne status_notified (dernier statut dont l'auteur a été prévenu) ;
--   * les idées déjà existantes ne déclenchent aucun mail (status_notified = statut actuel) ;
--   * pas de désactivation par les utilisateurs pour l'instant (décision de Daniela) ; en cas de besoin,
--     les admins peuvent couper l'envoi pour tout le monde : ALTER TABLE public.ideas DISABLE TRIGGER email_statut_idee.
--
-- Fonctionnement : comme l'e-mail de bienvenue, un trigger appelle la fonction Edge « email-statut-idee »
-- (pg_net, asynchrone, protégé par try/catch : la décision du manager réussit toujours). C'est la fonction
-- qui envoie le mail via Brevo ; si Brevo échoue, status_notified n'est pas avancé.
--
-- AVANT D'EXÉCUTER : remplacer REMPLACER_PAR_LE_SECRET par la valeur du secret WEBHOOK_SECRET
-- (la même que pour email-bienvenue ; ne pas committer la vraie valeur). pg_net doit être actif.

-- 1. Colonnes ---------------------------------------------------------------------
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS status_notified text;
UPDATE public.ideas SET status_notified = status WHERE status_notified IS NULL;
ALTER TABLE public.ideas ALTER COLUMN status_notified SET DEFAULT 'en attente';
ALTER TABLE public.ideas ALTER COLUMN status_notified SET NOT NULL;

-- 2. Trigger ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notifier_statut_idee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- L'auteur décide lui-même de sa propre idée : inutile de le prévenir
  IF lower(coalesce(auth.jwt() ->> 'email', '')) = lower(NEW.author_email) THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://tjffpngjczxwpunijmpy.supabase.co/functions/v1/email-statut-idee',
      headers := '{"Content-Type":"application/json","x-webhook-secret":"REMPLACER_PAR_LE_SECRET"}'::jsonb,
      body := jsonb_build_object('idea_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'email-statut-idee : appel impossible (%)', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notifier_statut_idee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS email_statut_idee ON public.ideas;
CREATE TRIGGER email_statut_idee
  AFTER UPDATE OF status ON public.ideas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notifier_statut_idee();
