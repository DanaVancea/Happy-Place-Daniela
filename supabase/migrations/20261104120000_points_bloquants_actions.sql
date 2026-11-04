-- ============================================================
-- Onglet Points bloquants : criticité à 4 niveaux, actions, sujet sensible, historique
-- ============================================================
-- Règles décidées avec Daniela (4 novembre 2026) :
--   * criticité : Critique, Élevée, Moyenne, Faible (critical -> critique, warning -> moyenne,
--     info -> faible) ;
--   * un point concerne une équipe (colonne department, choisie dans la liste des équipes) ;
--   * collaborateur : lecture seule ; manager : crée et modifie les points (et leurs actions) de
--     ses équipes ; admin : tout. Un point n'est pas supprimé mais archivé (statut RÉSOLU) ; la
--     suppression reste réservée à l'admin ;
--   * actions : une personne responsable (de n'importe quelle équipe), statut prévue / en cours /
--     faite, échéance obligatoire. Le responsable peut changer le statut de SON action ;
--   * sujet sensible : seuls les admins le décident ; le point (et ses actions, son historique)
--     n'est alors lisible que par les admins et le manager de l'équipe choisie (pas ses autres membres).
--     Filtrage par RLS : la donnée ne quitte pas la base pour les autres ;
--   * historique des modifications lisible des admins et managers de l'équipe.
-- À exécuter ensuite : select * from private.run_smoke_tests();  (tout doit être ok = true)

-- 1. Criticité à 4 niveaux ----------------------------------------------------
-- Renommages sans erreur si la migration est rejouée.
DO $$
DECLARE
  _pair text[];
BEGIN
  FOREACH _pair SLICE 1 IN ARRAY ARRAY[['critical', 'critique'], ['warning', 'moyenne'], ['info', 'faible']] LOOP
    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'blocker_severity' AND e.enumlabel = _pair[1]) THEN
      EXECUTE format('ALTER TYPE public.blocker_severity RENAME VALUE %L TO %L', _pair[1], _pair[2]);
    END IF;
  END LOOP;
END $$;
ALTER TYPE public.blocker_severity ADD VALUE IF NOT EXISTS 'élevée' BEFORE 'moyenne';
ALTER TABLE public.blockers ALTER COLUMN severity SET DEFAULT 'moyenne'::public.blocker_severity;

-- 2. Colonnes : sujet sensible, auteur ----------------------------------------
ALTER TABLE public.blockers
  ADD COLUMN IF NOT EXISTS sensitive_team text REFERENCES public.teams(name) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

-- 3. Fonctions de droits ------------------------------------------------------
-- Gère les points de cette équipe : admin, ou manager de l'équipe.
CREATE OR REPLACE FUNCTION private.can_edit_blocker_team(_team text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.can_review_team(_team)
$$;

-- Lit ce point : tout compte autorisé, sauf sujet sensible (tous les admins et le manager de l'équipe choisie ; pas les autres membres).
CREATE OR REPLACE FUNCTION private.can_read_blocker(_sensitive_team text, _created_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.is_allowed() AND (
    _sensitive_team IS NULL
    OR private.is_admin()
    OR (private.current_app_role() = 'manager'::public.app_role AND private.can_review_team(_sensitive_team))
  )
$$;

CREATE OR REPLACE FUNCTION private.can_read_blocker_id(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.blockers b
                 WHERE b.id = _id AND private.can_read_blocker(b.sensitive_team, b.created_by))
$$;

CREATE OR REPLACE FUNCTION private.can_edit_blocker_id(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.blockers b
                 WHERE b.id = _id
                   AND private.can_read_blocker(b.sensitive_team, b.created_by)
                   AND private.can_edit_blocker_team(b.department))
$$;
REVOKE ALL ON FUNCTION private.can_edit_blocker_team(text), private.can_read_blocker(text, uuid),
  private.can_read_blocker_id(uuid), private.can_edit_blocker_id(uuid) FROM PUBLIC, anon;

-- 4. Politiques RLS des points -----------------------------------------------
DROP POLICY IF EXISTS "Allowed read" ON public.blockers;
DROP POLICY IF EXISTS "Admin write" ON public.blockers;
CREATE POLICY "Read blockers" ON public.blockers FOR SELECT TO authenticated
  USING (private.can_read_blocker(sensitive_team, created_by));
CREATE POLICY "Insert blockers" ON public.blockers FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_blocker_team(department));
CREATE POLICY "Update blockers" ON public.blockers FOR UPDATE TO authenticated
  USING (private.can_read_blocker(sensitive_team, created_by) AND private.can_edit_blocker_team(department))
  WITH CHECK (private.can_edit_blocker_team(department));
CREATE POLICY "Delete blockers" ON public.blockers FOR DELETE TO authenticated
  USING (private.is_admin() AND private.can_read_blocker(sensitive_team, created_by));

-- Seul un admin décide du caractère sensible (et de l'équipe qui le voit).
CREATE OR REPLACE FUNCTION private.check_blocker_sensitive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT private.is_admin() AND NEW.sensitive_team IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.sensitive_team END) THEN
    RAISE EXCEPTION 'Seul un admin peut rendre un point bloquant sensible.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_blocker_sensitive ON public.blockers;
CREATE TRIGGER check_blocker_sensitive BEFORE INSERT OR UPDATE ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.check_blocker_sensitive();

-- 5. Actions ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocker_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.blockers(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'prévue',
  due_date date NOT NULL,
  owner_email text NOT NULL,
  owner_name text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocker_actions_status_check CHECK (status IN ('prévue', 'en cours', 'faite')),
  CONSTRAINT blocker_actions_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 200)
);
CREATE INDEX IF NOT EXISTS blocker_actions_blocker_idx ON public.blocker_actions (blocker_id, due_date);
ALTER TABLE public.blocker_actions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocker_actions TO authenticated;
GRANT ALL ON public.blocker_actions TO service_role;

CREATE POLICY "Read actions" ON public.blocker_actions FOR SELECT TO authenticated
  USING (private.can_read_blocker_id(blocker_id));
CREATE POLICY "Insert actions" ON public.blocker_actions FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_blocker_id(blocker_id));
CREATE POLICY "Update actions" ON public.blocker_actions FOR UPDATE TO authenticated
  USING (private.can_edit_blocker_id(blocker_id)
         OR (owner_email = lower(auth.jwt() ->> 'email') AND private.can_read_blocker_id(blocker_id)))
  WITH CHECK (private.can_edit_blocker_id(blocker_id)
         OR (owner_email = lower(auth.jwt() ->> 'email') AND private.can_read_blocker_id(blocker_id)));
CREATE POLICY "Delete actions" ON public.blocker_actions FOR DELETE TO authenticated
  USING (private.can_edit_blocker_id(blocker_id));

-- Le responsable (non gestionnaire de l'équipe) ne peut changer que le statut de son action.
CREATE OR REPLACE FUNCTION private.check_blocker_action_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  NEW.updated_at := now();
  IF NOT private.can_edit_blocker_id(OLD.blocker_id)
     AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.due_date IS DISTINCT FROM OLD.due_date
          OR NEW.owner_email IS DISTINCT FROM OLD.owner_email OR NEW.owner_name IS DISTINCT FROM OLD.owner_name
          OR NEW.blocker_id IS DISTINCT FROM OLD.blocker_id) THEN
    RAISE EXCEPTION 'Le responsable ne peut modifier que le statut de son action.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_blocker_action_update ON public.blocker_actions;
CREATE TRIGGER check_blocker_action_update BEFORE UPDATE ON public.blocker_actions
  FOR EACH ROW EXECUTE FUNCTION private.check_blocker_action_update();

-- Liste des personnes choisissables comme responsable (toutes équipes confondues).
CREATE OR REPLACE FUNCTION public.blocker_assignable_users()
RETURNS TABLE (email text, name text, team text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT u.email,
         coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email),
         u.team
  FROM public.allowed_users u
  WHERE private.is_manager_or_admin()
    AND (u.departure_date IS NULL OR u.departure_date >= current_date)
  ORDER BY 2
$$;
REVOKE ALL ON FUNCTION public.blocker_assignable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blocker_assignable_users() TO authenticated;

-- 6. Historique ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocker_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.blockers(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_name text NOT NULL,
  summary text NOT NULL
);
CREATE INDEX IF NOT EXISTS blocker_history_blocker_idx ON public.blocker_history (blocker_id, changed_at DESC);
ALTER TABLE public.blocker_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.blocker_history TO authenticated;
GRANT ALL ON public.blocker_history TO service_role;
-- Lisible des admins et managers de l'équipe ; aucune écriture directe (déclencheurs uniquement).
CREATE POLICY "Read history" ON public.blocker_history FOR SELECT TO authenticated
  USING (private.can_edit_blocker_id(blocker_id));

CREATE OR REPLACE FUNCTION private.log_blocker_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _who text := coalesce(private.my_display_name(), 'Système');
  _id uuid;
BEGIN
  IF TG_TABLE_NAME = 'blockers' THEN
    _id := NEW.id;
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
        VALUES (_id, _who, 'Point créé (criticité ' || NEW.severity::text || ')');
    ELSE
      IF NEW.severity IS DISTINCT FROM OLD.severity THEN
        INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
          VALUES (_id, _who, 'Criticité : ' || OLD.severity::text || ' → ' || NEW.severity::text);
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
          VALUES (_id, _who, 'Statut : ' || OLD.status::text || ' → ' || NEW.status::text);
      END IF;
      IF NEW.department IS DISTINCT FROM OLD.department THEN
        INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
          VALUES (_id, _who, 'Équipe concernée : ' || OLD.department || ' → ' || NEW.department);
      END IF;
      IF NEW.sensitive_team IS DISTINCT FROM OLD.sensitive_team THEN
        INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
          VALUES (_id, _who, CASE WHEN NEW.sensitive_team IS NULL THEN 'Sujet sensible retiré'
                                  ELSE 'Sujet sensible : visible par ' || NEW.sensitive_team END);
      END IF;
    END IF;
  ELSE
    _id := coalesce(NEW.blocker_id, OLD.blocker_id);
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
        VALUES (_id, _who, 'Action ajoutée : « ' || NEW.title || ' » (' || NEW.owner_name || ', échéance ' || to_char(NEW.due_date, 'DD/MM/YYYY') || ')');
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
        VALUES (_id, _who, 'Action supprimée : « ' || OLD.title || ' »');
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
          VALUES (_id, _who, 'Action « ' || NEW.title || ' » : ' || OLD.status || ' → ' || NEW.status);
      END IF;
      IF NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.owner_email IS DISTINCT FROM OLD.owner_email
         OR NEW.title IS DISTINCT FROM OLD.title THEN
        INSERT INTO public.blocker_history (blocker_id, changed_by_name, summary)
          VALUES (_id, _who, 'Action « ' || NEW.title || ' » modifiée (responsable ' || NEW.owner_name || ', échéance ' || to_char(NEW.due_date, 'DD/MM/YYYY') || ')');
      END IF;
    END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS log_blocker_change ON public.blockers;
CREATE TRIGGER log_blocker_change AFTER INSERT OR UPDATE ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.log_blocker_change();
DROP TRIGGER IF EXISTS log_blocker_action_change ON public.blocker_actions;
CREATE TRIGGER log_blocker_action_change AFTER INSERT OR UPDATE OR DELETE ON public.blocker_actions
  FOR EACH ROW EXECUTE FUNCTION private.log_blocker_change();
