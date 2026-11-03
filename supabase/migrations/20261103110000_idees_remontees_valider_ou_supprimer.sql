-- ============================================================
-- Idées remontées à la société : l'admin ne peut que les valider ou les supprimer
-- ============================================================
-- (remplace moderate_idea ; pas de renvoi en débat depuis le statut « remontée »)

CREATE OR REPLACE FUNCTION public.moderate_idea(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _i public.ideas;
  _new text;
  _admin boolean := coalesce(private.is_admin(), false);
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
BEGIN
  SELECT * INTO _i FROM public.ideas WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Idée introuvable.'; END IF;
  IF NOT private.can_review_team(_i.team) THEN
    RAISE EXCEPTION 'Seul le manager de l''équipe « % » (ou un admin) peut traiter cette idée.', _i.team
      USING ERRCODE = '42501';
  END IF;

  _new := CASE _action
    WHEN 'valider' THEN 'validée'
    WHEN 'supprimer' THEN 'supprimée'
    WHEN 'debat' THEN 'en débat'
    WHEN 'remonter' THEN 'remontée'
    ELSE NULL END;
  IF _new IS NULL THEN RAISE EXCEPTION 'Action inconnue.'; END IF;

  -- Une idée remontée à la société ne peut pas être renvoyée en débat : l'admin la valide ou la supprime.
  IF _i.status = 'remontée' AND _new NOT IN ('validée', 'supprimée') THEN
    RAISE EXCEPTION 'Une idée remontée à la société ne peut être que validée ou supprimée.';
  END IF;

  IF NOT _admin THEN
    IF _i.status = 'en attente' THEN NULL;
    ELSIF _i.status = 'en débat' AND _new IN ('validée', 'supprimée') THEN NULL;
    ELSE
      RAISE EXCEPTION 'Cette idée est déjà traitée (statut : %).', _i.status;
    END IF;
  ELSIF _i.status = _new THEN
    RAISE EXCEPTION 'Cette idée a déjà le statut « % ».', _i.status;
  END IF;

  IF _new = 'supprimée' AND (_reason_clean IS NULL OR char_length(_reason_clean) < 5) THEN
    RAISE EXCEPTION 'Une raison d''au moins 5 caractères est obligatoire pour supprimer une idée.';
  END IF;
  IF _reason_clean IS NOT NULL AND char_length(_reason_clean) > 500 THEN
    RAISE EXCEPTION 'La raison ou la note est limitée à 500 caractères.';
  END IF;

  UPDATE public.ideas SET
    status = _new,
    moderated_by_name = private.my_display_name(),
    moderated_at = now(),
    deletion_reason = CASE WHEN _new = 'supprimée' THEN _reason_clean ELSE NULL END,
    escalation_note = CASE WHEN _new = 'remontée' THEN _reason_clean ELSE NULL END
  WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.moderate_idea(uuid, text, text) TO authenticated;
