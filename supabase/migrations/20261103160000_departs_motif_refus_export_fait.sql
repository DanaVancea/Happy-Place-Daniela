-- ============================================================
-- Départs : motif obligatoire d'un refus, et repère « données téléchargées »
-- ============================================================
-- * Refuser la demande de départ d'un manager demande un motif (visible du manager).
-- * Une fois les données d'un collaborateur téléchargées (export RGPD), la liste des
--   départs l'indique : « Données téléchargées le … ».

ALTER TABLE public.departure_requests ADD COLUMN IF NOT EXISTS decision_reason text;
ALTER TABLE public.departure_requests DROP CONSTRAINT IF EXISTS departure_requests_reason_length;
ALTER TABLE public.departure_requests ADD CONSTRAINT departure_requests_reason_length
  CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 500);

ALTER TABLE public.allowed_users ADD COLUMN IF NOT EXISTS data_exported_at timestamptz;

-- Valider ou refuser (motif obligatoire pour un refus)
DROP FUNCTION IF EXISTS public.traiter_demande_depart(uuid, boolean);
CREATE OR REPLACE FUNCTION public.traiter_demande_depart(_id uuid, _accept boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _r public.departure_requests%ROWTYPE;
  _why text := nullif(btrim(coalesce(_reason, '')), '');
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Seul un admin peut traiter une demande de départ.' USING ERRCODE = '42501';
  END IF;
  IF NOT _accept AND (_why IS NULL OR char_length(_why) < 5) THEN
    RAISE EXCEPTION 'Indique le motif du refus (5 caractères minimum).';
  END IF;
  IF _why IS NOT NULL AND char_length(_why) > 500 THEN
    RAISE EXCEPTION 'Motif trop long (500 caractères maximum).';
  END IF;
  SELECT * INTO _r FROM public.departure_requests WHERE id = _id AND status = 'en attente' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable ou déjà traitée.';
  END IF;
  IF _accept THEN
    UPDATE public.allowed_users SET departure_date = greatest(_r.departure_date, current_date)
     WHERE id = _r.user_id;
  END IF;
  UPDATE public.departure_requests
     SET status = CASE WHEN _accept THEN 'validée' ELSE 'refusée' END,
         decision_reason = CASE WHEN _accept THEN NULL ELSE _why END,
         decided_by_name = coalesce(private.my_display_name(), lower(auth.jwt() ->> 'email')),
         decided_at = now()
   WHERE id = _id;
  PERFORM private.log_admin_action(
    CASE WHEN _accept THEN 'Demande de départ validée' ELSE 'Demande de départ refusée' END,
    _r.user_label,
    'Demandée par ' || _r.requested_by_name || CASE WHEN _accept THEN '' ELSE ' · motif : ' || _why END);
END $$;
REVOKE ALL ON FUNCTION public.traiter_demande_depart(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.traiter_demande_depart(uuid, boolean, text) TO authenticated;

-- Appelée par l'app une fois le fichier réellement téléchargé
CREATE OR REPLACE FUNCTION public.marquer_donnees_telechargees(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux admins.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.allowed_users SET data_exported_at = now() WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.marquer_donnees_telechargees(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marquer_donnees_telechargees(uuid) TO authenticated;
