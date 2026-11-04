-- Responsable d'un point bloquant (décidé avec Daniela, 4 novembre 2026) :
--   * un point peut avoir une personne responsable (owner_email / owner_name), de n'importe quelle équipe ;
--   * le responsable peut changer UNIQUEMENT le STATUT de son point : criticité, équipe, visibilité,
--     responsable, textes et archivage restent réservés à l'admin et au manager de l'équipe ;
--   * les autres collaborateurs restent en lecture seule.
ALTER TABLE public.blockers
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_name text;

-- Le compte connecté est responsable de ce point.
CREATE OR REPLACE FUNCTION private.is_blocker_owner(_owner_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT _owner_email IS NOT NULL AND lower(_owner_email) = lower(auth.jwt() ->> 'email')
$$;
REVOKE ALL ON FUNCTION private.is_blocker_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_blocker_owner(text) TO authenticated;

DROP POLICY IF EXISTS "Update blockers" ON public.blockers;
CREATE POLICY "Update blockers" ON public.blockers FOR UPDATE TO authenticated
  USING (private.can_read_blocker(sensitive_team, created_by)
         AND (private.can_edit_blocker_team(department) OR private.is_blocker_owner(owner_email)))
  WITH CHECK (private.can_edit_blocker_team(department) OR private.is_blocker_owner(owner_email));

-- Le responsable (qui ne gère pas l'équipe) ne peut changer que le statut.
CREATE OR REPLACE FUNCTION private.check_blocker_owner_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT private.can_edit_blocker_team(OLD.department)
     AND (NEW.title IS DISTINCT FROM OLD.title
          OR NEW.description IS DISTINCT FROM OLD.description
          OR NEW.department IS DISTINCT FROM OLD.department
          OR NEW.severity IS DISTINCT FROM OLD.severity
          OR NEW.sensitive_team IS DISTINCT FROM OLD.sensitive_team
          OR NEW.owner_email IS DISTINCT FROM OLD.owner_email
          OR NEW.owner_name IS DISTINCT FROM OLD.owner_name
          OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Le responsable du point ne peut modifier que le statut du point.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_blocker_owner_update ON public.blockers;
CREATE TRIGGER check_blocker_owner_update BEFORE UPDATE ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.check_blocker_owner_update();

-- Historique : le changement de responsable est tracé.
CREATE OR REPLACE FUNCTION private.log_blocker_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.owner_email IS DISTINCT FROM OLD.owner_email THEN
    INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
      VALUES (NEW.id, coalesce(private.my_display_name(), 'Système'),
              CASE WHEN NEW.owner_name IS NULL THEN 'Responsable du point retiré'
                   ELSE 'Responsable du point : ' || NEW.owner_name END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS log_blocker_owner ON public.blockers;
CREATE TRIGGER log_blocker_owner AFTER UPDATE OF owner_email ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.log_blocker_owner();
