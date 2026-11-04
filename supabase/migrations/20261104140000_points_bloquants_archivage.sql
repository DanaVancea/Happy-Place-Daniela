-- Archivage des points bloquants (décidé avec Daniela, 4 novembre 2026) :
--   * un point passé en RÉSOLU reste dans la liste ;
--   * le manager de l'équipe concernée ou un admin peut l'archiver à la main (archived_at) ;
--   * il passe aussi en archive automatiquement un mois après son passage en RÉSOLU (resolved_at) :
--     c'est calculé à l'affichage, aucune tâche planifiée n'est nécessaire.

ALTER TABLE public.blockers
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Les points déjà résolus : la date de résolution est leur dernière mise à jour.
UPDATE public.blockers SET resolved_at = updated_at
WHERE status = 'RÉSOLU'::public.blocker_status AND resolved_at IS NULL;

CREATE OR REPLACE FUNCTION private.set_blocker_resolved_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.status = 'RÉSOLU'::public.blocker_status THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  ELSE
    NEW.resolved_at := NULL;
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_blocker_resolved_at ON public.blockers;
CREATE TRIGGER set_blocker_resolved_at BEFORE INSERT OR UPDATE OF status ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.set_blocker_resolved_at();

-- Seul un point résolu peut être archivé.
CREATE OR REPLACE FUNCTION private.check_blocker_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND NEW.status IS DISTINCT FROM 'RÉSOLU'::public.blocker_status THEN
    RAISE EXCEPTION 'Seul un point bloquant résolu peut être archivé.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_blocker_archive ON public.blockers;
CREATE TRIGGER check_blocker_archive BEFORE UPDATE OF archived_at ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.check_blocker_archive();

CREATE OR REPLACE FUNCTION private.log_blocker_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NEW.archived_at IS NOT NULL THEN
    INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
      VALUES (NEW.id, coalesce(private.my_display_name(), 'Système'), 'Point archivé');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS log_blocker_archive ON public.blockers;
CREATE TRIGGER log_blocker_archive AFTER UPDATE OF archived_at ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.log_blocker_archive();
