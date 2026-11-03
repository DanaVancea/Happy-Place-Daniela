-- ============================================================
-- Onglet Idées par équipe : modération par le manager, débat, remontée à la société
-- ============================================================
-- Règles décidées avec Daniela (3 novembre 2026) :
--   * un collaborateur appartient à une seule équipe (allowed_users.team) ; il ne soumet
--     que pour son équipe et ne voit que les idées publiées de son équipe ;
--   * un manager voit les idées publiées de toutes les équipes et peut soumettre pour
--     n'importe quelle équipe, mais ne modère que les idées de ses équipes (manager_teams) ;
--     une idée déposée par un manager pour une autre équipe est modérée par le manager
--     de cette équipe ;
--   * un admin voit tout et peut tout faire ;
--   * une idée reste « en attente » (visible de son seul auteur et de ses modérateurs)
--     tant que le manager n'a pas agi. Actions : valider (mise en œuvre, likes),
--     supprimer (raison obligatoire, visible de l'auteur), soumettre en débat
--     (likes + commentaires dans l'équipe), remonter à la société (reçue par les admins,
--     l'auteur reste visible avec la mention « remontée par … » et une note) ;
--   * une idée en débat peut ensuite être validée ou supprimée ;
--   * mots interdits (public.blocked_words) bloqués à l'envoi d'une idée et d'un commentaire.
-- Les anciennes soumissions (table public.submissions) ne sont pas touchées.

-- 1. Idées ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team text NOT NULL REFERENCES public.teams(name) ON UPDATE CASCADE ON DELETE RESTRICT,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_email text NOT NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'en attente',
  deletion_reason text,
  moderated_by_name text,
  moderated_at timestamptz,
  escalation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ideas_status_check CHECK (status IN ('en attente', 'validée', 'en débat', 'remontée', 'supprimée')),
  CONSTRAINT ideas_content_length CHECK (char_length(btrim(content)) BETWEEN 5 AND 2000),
  CONSTRAINT ideas_deletion_reason_check CHECK (
    status <> 'supprimée' OR char_length(btrim(coalesce(deletion_reason, ''))) BETWEEN 5 AND 500),
  CONSTRAINT ideas_escalation_note_check CHECK (escalation_note IS NULL OR char_length(escalation_note) <= 500)
);
CREATE INDEX IF NOT EXISTS ideas_team_status_idx ON public.ideas (team, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ideas_author_idx ON public.ideas (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.idea_likes (
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.idea_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idea_comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS idea_comments_idea_idx ON public.idea_comments (idea_id, created_at);

-- 2. Fonctions utilitaires ----------------------------------------------------
-- Équipe du compte connecté (colonne team de allowed_users)
CREATE OR REPLACE FUNCTION private.my_team()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT au.team FROM public.allowed_users au WHERE au.email = lower(auth.jwt() ->> 'email') LIMIT 1
$$;

-- Nom affiché du compte connecté
CREATE OR REPLACE FUNCTION private.my_display_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT coalesce(nullif(btrim(concat_ws(' ', au.first_name, au.last_name)), ''), au.email)
  FROM public.allowed_users au WHERE au.email = lower(auth.jwt() ->> 'email') LIMIT 1
$$;
ALTER TABLE public.idea_comments ALTER COLUMN author_name SET DEFAULT private.my_display_name();

-- Le compte appartient à l'équipe, la dirige (manager) ou est admin
CREATE OR REPLACE FUNCTION private.in_team(_team text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.is_admin()
      OR lower(coalesce(private.my_team(), '')) = lower(_team)
      OR (private.current_app_role() = 'manager'::public.app_role AND private.can_review_team(_team))
$$;

-- Peut-on lire cette idée ? (utilisé par les politiques des likes et commentaires)
CREATE OR REPLACE FUNCTION private.can_read_idea(_idea_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ideas i
    WHERE i.id = _idea_id
      AND private.is_allowed()
      AND (
        private.is_admin()
        OR i.author_email = lower(auth.jwt() ->> 'email')
        OR (private.current_app_role() = 'manager'::public.app_role
            AND (private.can_review_team(i.team) OR i.status IN ('validée', 'en débat')))
        OR (i.status IN ('validée', 'en débat') AND lower(coalesce(private.my_team(), '')) = lower(i.team))
      ))
$$;

-- Statut de l'idée (pour les politiques des likes et commentaires)
CREATE OR REPLACE FUNCTION private.idea_status(_idea_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT status FROM public.ideas WHERE id = _idea_id
$$;
CREATE OR REPLACE FUNCTION private.idea_team(_idea_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT team FROM public.ideas WHERE id = _idea_id
$$;

-- 3. Mots interdits : idées et commentaires ---------------------------------
CREATE OR REPLACE FUNCTION private.check_idea_blocked_words()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _w text;
BEGIN
  IF TG_TABLE_NAME = 'ideas' THEN
    _w := private.first_blocked_word(NEW.content);
  ELSE
    _w := private.first_blocked_word(NEW.body);
  END IF;
  IF _w IS NOT NULL THEN
    RAISE EXCEPTION 'Envoi bloqué : le mot « % » n''est pas autorisé.', _w
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_idea_blocked_words ON public.ideas;
CREATE TRIGGER check_idea_blocked_words BEFORE INSERT ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION private.check_idea_blocked_words();
DROP TRIGGER IF EXISTS check_idea_comment_blocked_words ON public.idea_comments;
CREATE TRIGGER check_idea_comment_blocked_words BEFORE INSERT ON public.idea_comments
  FOR EACH ROW EXECUTE FUNCTION private.check_idea_blocked_words();

-- 4. Droits de lecture / écriture ---------------------------------------------
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read ideas" ON public.ideas;
CREATE POLICY "Read ideas" ON public.ideas FOR SELECT TO authenticated
  USING (private.can_read_idea(id));
-- Aucune politique d'écriture : les idées passent par submit_idea / moderate_idea.

DROP POLICY IF EXISTS "Read likes" ON public.idea_likes;
CREATE POLICY "Read likes" ON public.idea_likes FOR SELECT TO authenticated
  USING (private.can_read_idea(idea_id));
DROP POLICY IF EXISTS "Like in team" ON public.idea_likes;
CREATE POLICY "Like in team" ON public.idea_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.is_allowed()
    AND private.idea_status(idea_id) IN ('validée', 'en débat')
    AND private.in_team(private.idea_team(idea_id)));
DROP POLICY IF EXISTS "Unlike" ON public.idea_likes;
CREATE POLICY "Unlike" ON public.idea_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Read comments" ON public.idea_comments;
CREATE POLICY "Read comments" ON public.idea_comments FOR SELECT TO authenticated
  USING (private.can_read_idea(idea_id));
DROP POLICY IF EXISTS "Comment in debate" ON public.idea_comments;
CREATE POLICY "Comment in debate" ON public.idea_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND private.is_allowed()
    AND private.idea_status(idea_id) = 'en débat'
    AND private.in_team(private.idea_team(idea_id)));
DROP POLICY IF EXISTS "Delete own or moderated comment" ON public.idea_comments;
CREATE POLICY "Delete own or moderated comment" ON public.idea_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR private.can_review_team(private.idea_team(idea_id)));

REVOKE ALL ON public.ideas, public.idea_likes, public.idea_comments FROM anon, authenticated;
GRANT SELECT ON public.ideas TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.idea_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.idea_comments TO authenticated;
GRANT ALL ON public.ideas, public.idea_likes, public.idea_comments TO service_role;

REVOKE ALL ON FUNCTION private.my_team(), private.my_display_name(), private.in_team(text),
  private.can_read_idea(uuid), private.idea_status(uuid), private.idea_team(uuid),
  private.check_idea_blocked_words() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.my_team(), private.my_display_name(), private.in_team(text),
  private.can_read_idea(uuid), private.idea_status(uuid), private.idea_team(uuid) TO authenticated;

-- 5. Soumettre une idée -------------------------------------------------------
-- Collaborateur : toujours pour son équipe (le paramètre est ignoré).
-- Manager et admin : pour n'importe quelle équipe.
CREATE OR REPLACE FUNCTION public.submit_idea(_team text, _content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _role public.app_role := private.current_app_role();
  _target text;
  _id uuid;
BEGIN
  IF _role IS NULL THEN
    RAISE EXCEPTION 'Compte non autorisé.' USING ERRCODE = '42501';
  END IF;
  IF _role = 'collaborateur' THEN
    _target := private.my_team();
    IF _target IS NULL THEN
      RAISE EXCEPTION 'Tu n''as pas encore d''équipe : demande à un admin de t''en attribuer une.';
    END IF;
  ELSE
    SELECT t.name INTO _target FROM public.teams t WHERE lower(t.name) = lower(btrim(coalesce(_team, '')));
    IF _target IS NULL THEN
      RAISE EXCEPTION 'Choisis l''équipe concernée par ton idée.';
    END IF;
  END IF;
  INSERT INTO public.ideas (team, author_email, author_name, content)
  VALUES (_target, lower(auth.jwt() ->> 'email'), private.my_display_name(), btrim(_content))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- 6. Modérer une idée ---------------------------------------------------------
-- _action : 'valider' | 'supprimer' | 'debat' | 'remonter'
-- Le manager modère les idées de ses équipes (en attente), peut ensuite valider ou
-- supprimer une idée en débat. L'admin peut tout faire. Les idées remontées sont
-- traitées par les admins.
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

REVOKE ALL ON FUNCTION public.submit_idea(text, text), public.moderate_idea(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_idea(text, text), public.moderate_idea(uuid, text, text) TO authenticated;
