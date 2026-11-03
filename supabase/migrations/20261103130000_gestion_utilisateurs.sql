-- ============================================================
-- Onglet « Gestion des utilisateurs » (admins) : départs, demandes des managers,
-- suppression RGPD, export des données, journal des actions admin
-- ============================================================
-- Règles décidées avec Daniela (3 novembre 2026) :
--   * un départ programmé ne supprime plus rien automatiquement : un admin supprime
--     la personne à la main (l'ancien traitement quotidien qui supprimait à la date
--     de départ est désactivé) ;
--   * un manager peut signaler le départ d'un membre de son équipe : cela crée une
--     demande que l'admin valide (la date de départ est alors programmée) ou refuse ;
--   * supprimer un utilisateur efface ses données personnelles (profil, favoris, « Lu »,
--     compte de connexion) et anonymise ce qu'il a publié (« Ancien collaborateur »),
--     sans casser les idées validées ni les articles ;
--   * export RGPD : un admin récupère les données de la personne avant sa suppression ;
--   * un petit journal garde la trace des actions sensibles des admins.
-- Les garde-fous existants restent en place : dernier admin protégé
-- (private.protect_last_admin_role) et équipe non vide ou avec idées non supprimable
-- (clés étrangères ON DELETE RESTRICT).

-- 1. Départ programmé : plus de suppression automatique -----------------------
-- La date peut désormais être aujourd'hui (elle sert de repère et de rappel, plus de déclencheur).
CREATE OR REPLACE FUNCTION private.check_departure_date()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'private' AS $function$
BEGIN
  IF NEW.departure_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.departure_date IS DISTINCT FROM OLD.departure_date)
     AND NEW.departure_date < current_date THEN
    RAISE EXCEPTION 'La date de départ ne peut pas être dans le passé';
  END IF;
  RETURN NEW;
END $function$;

-- Même traitement quotidien qu'avant pour les rappels de documents, sans la boucle de suppression.
CREATE OR REPLACE FUNCTION private.run_departures()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $function$
BEGIN
  UPDATE public.departure_notices SET reminder_at = now()
   WHERE closed_at IS NULL AND downloaded_at IS NULL AND reminder_at IS NULL
     AND kind = 'préavis' AND departure_date - 2 <= current_date;

  UPDATE public.departure_notices SET closed_at = now(), departing_label = 'Utilisateur supprimé'
   WHERE closed_at IS NULL AND kind = 'sans préavis' AND created_at <= now() - interval '7 days';
END $function$;

-- 2. Journal des actions admin -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_email text NOT NULL,
  actor_name text NOT NULL,
  action text NOT NULL,
  target text,
  details text
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (private.is_admin());
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
-- Aucune écriture directe : seules les fonctions ci-dessous alimentent le journal.

CREATE OR REPLACE FUNCTION private.log_admin_action(_action text, _target text, _details text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _mail text := lower(nullif(auth.jwt() ->> 'email', ''));
BEGIN
  INSERT INTO public.admin_audit_log (actor_email, actor_name, action, target, details)
  VALUES (coalesce(_mail, 'système'), coalesce(private.my_display_name(), _mail, 'Système'),
          _action, _target, _details);
END $$;

CREATE OR REPLACE FUNCTION private.label_of_user(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), email) FROM public.allowed_users WHERE id = _id
$$;

-- Changement de rôle
CREATE OR REPLACE FUNCTION private.audit_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM private.log_admin_action('Changement de rôle', private.label_of_user(NEW.allowed_user_id),
      OLD.role::text || ' → ' || NEW.role::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_role_change ON public.allowed_user_roles;
CREATE TRIGGER audit_role_change AFTER UPDATE ON public.allowed_user_roles
  FOR EACH ROW EXECUTE FUNCTION private.audit_role_change();

-- Ajout / départ programmé / suppression d'un utilisateur
CREATE OR REPLACE FUNCTION private.audit_user_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF private.is_admin() THEN
      PERFORM private.log_admin_action('Utilisateur ajouté',
        coalesce(nullif(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), ''), NEW.email));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.departure_date IS DISTINCT FROM OLD.departure_date THEN
      _label := coalesce(nullif(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), ''), NEW.email);
      IF NEW.departure_date IS NULL THEN
        PERFORM private.log_admin_action('Départ annulé', _label);
      ELSE
        PERFORM private.log_admin_action('Départ programmé', _label, 'Le ' || to_char(NEW.departure_date, 'DD/MM/YYYY'));
      END IF;
    END IF;
  ELSE
    PERFORM private.log_admin_action('Utilisateur supprimé',
      coalesce(nullif(btrim(concat_ws(' ', OLD.first_name, OLD.last_name)), ''), OLD.email));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS audit_user_change ON public.allowed_users;
CREATE TRIGGER audit_user_change AFTER INSERT OR UPDATE OF departure_date OR DELETE ON public.allowed_users
  FOR EACH ROW EXECUTE FUNCTION private.audit_user_change();

-- Équipes : création, renommage, suppression
CREATE OR REPLACE FUNCTION private.audit_team_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.log_admin_action('Équipe créée', NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      PERFORM private.log_admin_action('Équipe renommée', NEW.name, OLD.name || ' → ' || NEW.name);
    END IF;
  ELSE
    PERFORM private.log_admin_action('Équipe supprimée', OLD.name);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS audit_team_change ON public.teams;
CREATE TRIGGER audit_team_change AFTER INSERT OR UPDATE OR DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION private.audit_team_change();

-- 3. Demandes de départ des managers ------------------------------------------
CREATE TABLE IF NOT EXISTS public.departure_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.allowed_users(id) ON DELETE CASCADE,
  user_label text NOT NULL,
  team text,
  requested_by_email text NOT NULL,
  requested_by_name text NOT NULL,
  departure_date date NOT NULL,
  comment text,
  status text NOT NULL DEFAULT 'en attente',
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departure_requests_status_check CHECK (status IN ('en attente', 'validée', 'refusée')),
  CONSTRAINT departure_requests_comment_length CHECK (comment IS NULL OR char_length(comment) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS departure_requests_one_pending_idx
  ON public.departure_requests (user_id) WHERE status = 'en attente';
ALTER TABLE public.departure_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and requester read departure requests" ON public.departure_requests;
CREATE POLICY "Admins and requester read departure requests" ON public.departure_requests
  FOR SELECT TO authenticated
  USING (private.is_admin() OR requested_by_email = lower(auth.jwt() ->> 'email'));
GRANT SELECT ON public.departure_requests TO authenticated;
GRANT ALL ON public.departure_requests TO service_role;

-- Membres que le manager connecté peut signaler (collaborateurs de ses équipes)
CREATE OR REPLACE FUNCTION public.mes_membres_equipe()
RETURNS TABLE (id uuid, first_name text, last_name text, team text, departure_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT u.id, u.first_name, u.last_name, u.team, u.departure_date
  FROM public.allowed_users u
  JOIN public.allowed_user_roles r ON r.allowed_user_id = u.id AND r.role = 'collaborateur'
  WHERE private.current_app_role() = 'manager'::public.app_role
    AND u.team IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.allowed_users me
      JOIN public.manager_teams mt ON mt.allowed_user_id = me.id
      WHERE me.email = lower(auth.jwt() ->> 'email') AND lower(mt.team) = lower(u.team))
  ORDER BY u.team, u.last_name, u.first_name
$$;
REVOKE ALL ON FUNCTION public.mes_membres_equipe() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mes_membres_equipe() TO authenticated;

-- Un manager signale le départ d'un collaborateur de son équipe
CREATE OR REPLACE FUNCTION public.signaler_depart(_user_id uuid, _date date, _comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _u public.allowed_users%ROWTYPE;
  _c text := nullif(btrim(coalesce(_comment, '')), '');
  _id uuid;
BEGIN
  IF private.current_app_role() IS DISTINCT FROM 'manager'::public.app_role THEN
    RAISE EXCEPTION 'Seul un manager peut signaler un départ.' USING ERRCODE = '42501';
  END IF;
  IF _date IS NULL OR _date < current_date THEN
    RAISE EXCEPTION 'Choisis une date de départ à partir d''aujourd''hui.';
  END IF;
  IF _c IS NOT NULL AND char_length(_c) > 500 THEN
    RAISE EXCEPTION 'Commentaire trop long (500 caractères maximum).';
  END IF;
  SELECT * INTO _u FROM public.allowed_users WHERE id = _user_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.mes_membres_equipe() m WHERE m.id = _user_id) THEN
    RAISE EXCEPTION 'Tu ne peux signaler que le départ d''un membre de ton équipe.' USING ERRCODE = '42501';
  END IF;
  BEGIN
    INSERT INTO public.departure_requests (user_id, user_label, team, requested_by_email, requested_by_name, departure_date, comment)
    VALUES (_user_id, private.label_of_user(_user_id), _u.team, lower(auth.jwt() ->> 'email'),
            coalesce(private.my_display_name(), lower(auth.jwt() ->> 'email')), _date, _c)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Une demande de départ est déjà en attente pour cette personne.';
  END;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.signaler_depart(uuid, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.signaler_depart(uuid, date, text) TO authenticated;

-- Un admin valide (programme le départ) ou refuse la demande
CREATE OR REPLACE FUNCTION public.traiter_demande_depart(_id uuid, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _r public.departure_requests%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Seul un admin peut traiter une demande de départ.' USING ERRCODE = '42501';
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
         decided_by_name = coalesce(private.my_display_name(), lower(auth.jwt() ->> 'email')),
         decided_at = now()
   WHERE id = _id;
  PERFORM private.log_admin_action(
    CASE WHEN _accept THEN 'Demande de départ validée' ELSE 'Demande de départ refusée' END,
    _r.user_label, 'Demandée par ' || _r.requested_by_name);
END $$;
REVOKE ALL ON FUNCTION public.traiter_demande_depart(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.traiter_demande_depart(uuid, boolean) TO authenticated;

-- 4. Export RGPD des données d'un collaborateur -------------------------------
CREATE OR REPLACE FUNCTION public.exporter_donnees_utilisateur(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _u public.allowed_users%ROWTYPE;
  _role text;
  _uid uuid;
  _out jsonb;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Seul un admin peut exporter les données d''un utilisateur.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _u FROM public.allowed_users WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable.'; END IF;
  SELECT role::text INTO _role FROM public.allowed_user_roles WHERE allowed_user_id = _id;
  SELECT au.id INTO _uid FROM auth.users au WHERE lower(au.email) = _u.email LIMIT 1;

  _out := jsonb_build_object(
    'exporte_le', now(),
    'profil', jsonb_build_object(
      'email', _u.email, 'prenom', _u.first_name, 'nom', _u.last_name, 'equipe', _u.team,
      'role', _role, 'date_arrivee', _u.created_at, 'date_depart', _u.departure_date,
      'equipes_managees', coalesce((SELECT jsonb_agg(mt.team ORDER BY mt.team) FROM public.manager_teams mt WHERE mt.allowed_user_id = _id), '[]'::jsonb)),
    'idees', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', i.created_at, 'equipe', i.team, 'statut', i.status, 'contenu', i.content) ORDER BY i.created_at)
      FROM public.ideas i WHERE _uid IS NOT NULL AND i.author_id = _uid), '[]'::jsonb),
    'commentaires', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', c.created_at, 'idee', left(i.content, 80), 'commentaire', c.body) ORDER BY c.created_at)
      FROM public.idea_comments c JOIN public.ideas i ON i.id = c.idea_id
      WHERE _uid IS NOT NULL AND c.author_id = _uid), '[]'::jsonb),
    'likes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', l.created_at, 'idee', left(i.content, 80)) ORDER BY l.created_at)
      FROM public.idea_likes l JOIN public.ideas i ON i.id = l.idea_id
      WHERE _uid IS NOT NULL AND l.user_id = _uid), '[]'::jsonb),
    'favoris', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', f.created_at, 'article', n.title) ORDER BY f.created_at)
      FROM public.news_favorites f JOIN public.news n ON n.id = f.news_id
      WHERE _uid IS NOT NULL AND f.user_id = _uid), '[]'::jsonb),
    'articles_lus', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', r.read_at, 'article', n.title) ORDER BY r.read_at)
      FROM public.news_reads r JOIN public.news n ON n.id = r.news_id
      WHERE _uid IS NOT NULL AND r.user_id = _uid), '[]'::jsonb),
    'soumissions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', s.created_at, 'equipe', s.team, 'statut', s.status, 'contenu', s.content,
        'piece_jointe', s.attachment_name) ORDER BY s.created_at)
      FROM public.submissions s WHERE lower(s.submitted_by_email) = _u.email), '[]'::jsonb)
  );
  PERFORM private.log_admin_action('Export RGPD des données', private.label_of_user(_id));
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.exporter_donnees_utilisateur(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exporter_donnees_utilisateur(uuid) TO authenticated;

-- 5. Suppression d'un utilisateur : données personnelles effacées, contenu anonymisé
CREATE OR REPLACE FUNCTION public.supprimer_utilisateur(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _u public.allowed_users%ROWTYPE;
  _uid uuid;
  _name text;
  _anon constant text := 'Ancien collaborateur';
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Seul un admin peut supprimer un utilisateur.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _u FROM public.allowed_users WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable.'; END IF;
  IF _u.email = lower(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Tu ne peux pas supprimer ton propre compte.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.allowed_user_roles WHERE allowed_user_id = _id AND role = 'admin'::public.app_role)
     AND (SELECT count(*) FROM public.allowed_user_roles WHERE role = 'admin'::public.app_role) <= 1 THEN
    RAISE EXCEPTION 'Impossible de supprimer le dernier admin.';
  END IF;

  _name := nullif(btrim(concat_ws(' ', _u.first_name, _u.last_name)), '');
  SELECT au.id INTO _uid FROM auth.users au WHERE lower(au.email) = _u.email LIMIT 1;

  IF _uid IS NOT NULL THEN
    -- Données personnelles : effacées
    DELETE FROM public.news_favorites WHERE user_id = _uid;
    DELETE FROM public.news_reads WHERE user_id = _uid;
    -- Contenu publié : conservé mais anonymisé (les compteurs de likes restent justes)
    UPDATE public.idea_likes SET user_id = gen_random_uuid() WHERE user_id = _uid;
    UPDATE public.idea_comments SET author_name = _anon, author_id = gen_random_uuid() WHERE author_id = _uid;
    UPDATE public.ideas
       SET author_name = _anon, author_email = 'ancien.collaborateur@anonyme.invalid', author_id = gen_random_uuid()
     WHERE author_id = _uid;
  END IF;
  IF _name IS NOT NULL THEN
    UPDATE public.ideas SET moderated_by_name = _anon WHERE moderated_by_name = _name;
  END IF;

  -- Profil (rôle et équipes suivent en cascade). Le déclencheur anonymize_removed_user
  -- anonymise aussi les anciennes soumissions, les articles et l'historique.
  DELETE FROM public.allowed_users WHERE id = _id;
  -- Compte de connexion
  IF _uid IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = _uid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.supprimer_utilisateur(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.supprimer_utilisateur(uuid) TO authenticated;

COMMENT ON FUNCTION public.supprimer_utilisateur(uuid) IS
  'Admin uniquement : efface profil, favoris, « Lu » et compte de connexion ; anonymise idées, commentaires, likes (« Ancien collaborateur »).';
