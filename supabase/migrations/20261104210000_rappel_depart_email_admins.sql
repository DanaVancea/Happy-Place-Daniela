-- ============================================================
-- Rappel par e-mail aux admins avant le départ d'un collaborateur
-- ============================================================
-- Règles décidées avec Daniela (4 novembre 2026) :
--   * destinataires : les admins uniquement (eux seuls peuvent exporter les données) ;
--   * premier rappel 2 JOURS OUVRÉS avant la date de départ (week-ends exclus, jours fériés ignorés) ;
--   * relance le jour J (ou après) si les données n'ont toujours pas été téléchargées ;
--   * plus aucun mail dès que l'export est fait (allowed_users.data_exported_at) ;
--   * un seul envoi de chaque type par départ : si la date change, les compteurs repartent à zéro ;
--   * départ créé tard (J-1, J) : le rappel part dès le lendemain matin au plus tard, sans attendre J-2 ;
--   * aucune donnée personnelle dans le mail : juste le nom, la date et un lien.
--
-- Fonctionnement : un traitement quotidien (pg_cron) repère les départs concernés et appelle la fonction
-- Edge « rappel-depart » (pg_net). C'est la fonction qui envoie les mails PUIS note l'envoi et l'écrit
-- dans le journal admin : si Brevo échoue, rien n'est noté et le cron réessaie le lendemain.
--
-- AVANT D'EXÉCUTER : remplacer REMPLACER_PAR_LE_SECRET par la valeur du secret WEBHOOK_SECRET
-- (la même que pour email-bienvenue ; ne pas committer la vraie valeur). pg_net et pg_cron doivent être actifs.

-- 1. Traces d'envoi ----------------------------------------------------------------
ALTER TABLE public.allowed_users ADD COLUMN IF NOT EXISTS depart_rappel_j2_at timestamptz;
ALTER TABLE public.allowed_users ADD COLUMN IF NOT EXISTS depart_rappel_j0_at timestamptz;

-- Date changée ou annulée : on repart de zéro (nouveau départ = nouveaux rappels)
CREATE OR REPLACE FUNCTION private.reset_rappels_depart()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'private' AS $$
BEGIN
  IF NEW.departure_date IS DISTINCT FROM OLD.departure_date THEN
    NEW.depart_rappel_j2_at := NULL;
    NEW.depart_rappel_j0_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reset_rappels_depart ON public.allowed_users;
CREATE TRIGGER reset_rappels_depart BEFORE UPDATE OF departure_date ON public.allowed_users
  FOR EACH ROW EXECUTE FUNCTION private.reset_rappels_depart();

-- 2. Calcul : N jours ouvrés (lundi-vendredi) avant une date -------------------------
CREATE OR REPLACE FUNCTION private.jours_ouvres_avant(_date date, _n int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  _d date := _date;
  _reste int := _n;
BEGIN
  WHILE _reste > 0 LOOP
    _d := _d - 1;
    IF extract(isodow FROM _d) < 6 THEN _reste := _reste - 1; END IF;
  END LOOP;
  RETURN _d;
END $$;

-- 3. Traitement quotidien ------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.rappels_depart_admins()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Europe/Paris')::date;
  u record;
BEGIN
  FOR u IN
    SELECT id, departure_date,
           CASE WHEN departure_date <= _today THEN 'j0' ELSE 'j2' END AS kind
      FROM public.allowed_users
     WHERE departure_date IS NOT NULL
       AND data_exported_at IS NULL
       AND (
            (departure_date <= _today AND depart_rappel_j0_at IS NULL)
         OR (departure_date > _today AND depart_rappel_j2_at IS NULL
             AND private.jours_ouvres_avant(departure_date, 2) <= _today)
       )
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := 'https://tjffpngjczxwpunijmpy.supabase.co/functions/v1/rappel-depart',
        headers := '{"Content-Type":"application/json","x-webhook-secret":"REMPLACER_PAR_LE_SECRET"}'::jsonb,
        body := jsonb_build_object('user_id', u.id, 'kind', u.kind),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rappel-depart : appel impossible pour % (%)', u.id, SQLERRM;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.rappels_depart_admins() FROM PUBLIC, anon, authenticated;

-- Tous les jours à 6 h UTC (7 h en hiver, 8 h en été à Paris)
DO $$ BEGIN PERFORM cron.unschedule('rappel-depart-admins'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('rappel-depart-admins', '0 6 * * *', $$SELECT private.rappels_depart_admins()$$);
