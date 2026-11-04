-- Responsable d'action = collaborateur en charge d'une action du point (décidé avec Daniela, 4 novembre 2026).
--   * la personne en charge d'au moins une action d'un point peut changer le STATUT de ce point,
--     et seulement lui (criticité, équipe, textes, visibilité, archivage : admin / manager de l'équipe) ;
--   * elle ne peut agir que sur les points où elle a une action ; les autres restent en lecture seule.

CREATE OR REPLACE FUNCTION private.is_blocker_action_owner(_blocker_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocker_actions a
                 WHERE a.blocker_id = _blocker_id
                   AND lower(a.owner_email) = lower(auth.jwt() ->> 'email'))
$$;
REVOKE ALL ON FUNCTION private.is_blocker_action_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_blocker_action_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS "Update blockers" ON public.blockers;
CREATE POLICY "Update blockers" ON public.blockers FOR UPDATE TO authenticated
  USING (private.can_read_blocker(sensitive_team, created_by)
         AND (private.can_edit_blocker_team(department) OR private.is_blocker_action_owner(id)))
  WITH CHECK (private.can_edit_blocker_team(department) OR private.is_blocker_action_owner(id));

-- Le responsable d'action (qui ne gère pas l'équipe) ne peut changer que le statut.
CREATE OR REPLACE FUNCTION private.check_blocker_owner_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT private.can_edit_blocker_team(OLD.department)
     AND (NEW.title IS DISTINCT FROM OLD.title
          OR NEW.description IS DISTINCT FROM OLD.description
          OR NEW.department IS DISTINCT FROM OLD.department
          OR NEW.severity IS DISTINCT FROM OLD.severity
          OR NEW.sensitive_team IS DISTINCT FROM OLD.sensitive_team
          OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Le responsable d''une action ne peut modifier que le statut du point.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_blocker_owner_update ON public.blockers;
CREATE TRIGGER check_blocker_owner_update BEFORE UPDATE ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.check_blocker_owner_update();
