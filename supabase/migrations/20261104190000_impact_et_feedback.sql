-- ============================================================
-- Page « Impact » (admins) : usage de l'appli, idées par équipe, bouton de feedback
-- ============================================================
-- Règles décidées avec Daniela (4 novembre 2026) :
--   * utilisateur actif = a fait au moins une ACTION sur la période (idée, vote, commentaire,
--     création ou modification d'un point bloquant ou d'une action, « Lu » ou favori d'une actu,
--     envoi d'un feedback) : ouvrir l'appli ne suffit pas. Rapporté au nombre de collaborateurs
--     (comptes dont le départ n'est pas passé) ;
--   * pages les plus consultées : un compteur par personne, page et jour (Actus, Boîte à idées,
--     Points bloquants, Trombi) ; seuls des totaux sont lisibles, par les admins ;
--   * feedback : un bouton « Donner mon avis » toujours visible sur l'accueil (note de 1 à 5 +
--     commentaire libre), utilisable autant de fois qu'on veut pour collecter un maximum de retours
--     au début. Les réponses sont ANONYMES : aucune colonne ne relie une réponse à une personne
--     (note, commentaire, équipe, mois) ;
--   * seuls les admins lisent les réponses (RLS) et les exportent en CSV depuis la page Impact.
-- Aucune table n'est lisible directement par les non-admins : tout passe par des fonctions
-- SECURITY DEFINER qui vérifient le rôle.

-- 0. Aides -----------------------------------------------------------------------
-- Jour courant à l'heure de Paris (les semaines et les mois suivent le calendrier français).
CREATE OR REPLACE FUNCTION private.today_fr()
RETURNS date LANGUAGE sql STABLE SET search_path = public, private AS $$
  SELECT (now() AT TIME ZONE 'Europe/Paris')::date
$$;
REVOKE ALL ON FUNCTION private.today_fr() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.today_fr() TO authenticated;

-- 1. Activité : une ligne par personne, type d'action et jour -----------------------
CREATE TABLE IF NOT EXISTS public.user_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day date NOT NULL,
  PRIMARY KEY (user_id, day, kind),
  CONSTRAINT user_activity_kind_check CHECK (kind IN
    ('idee', 'vote', 'commentaire', 'point_bloquant', 'action_point', 'actu_lue', 'actu_favori', 'feedback'))
);
CREATE INDEX IF NOT EXISTS user_activity_day_idx ON public.user_activity (day);
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
-- Aucune politique : ni lecture ni écriture directes (déclencheurs et fonctions seulement).
GRANT ALL ON public.user_activity TO service_role;

CREATE OR REPLACE FUNCTION private.track_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  -- Ne doit jamais empêcher l'action de la personne : on ignore toute erreur de suivi.
  IF auth.uid() IS NOT NULL THEN
    BEGIN
      INSERT INTO public.user_activity (user_id, kind, day)
      VALUES (auth.uid(), TG_ARGV[0], private.today_fr())
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.track_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS track_activity_idee ON public.ideas;
CREATE TRIGGER track_activity_idee AFTER INSERT ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('idee');
DROP TRIGGER IF EXISTS track_activity_vote ON public.idea_likes;
CREATE TRIGGER track_activity_vote AFTER INSERT ON public.idea_likes
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('vote');
DROP TRIGGER IF EXISTS track_activity_commentaire ON public.idea_comments;
CREATE TRIGGER track_activity_commentaire AFTER INSERT ON public.idea_comments
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('commentaire');
DROP TRIGGER IF EXISTS track_activity_point_bloquant ON public.blockers;
CREATE TRIGGER track_activity_point_bloquant AFTER INSERT OR UPDATE ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('point_bloquant');
DROP TRIGGER IF EXISTS track_activity_action_point ON public.blocker_actions;
CREATE TRIGGER track_activity_action_point AFTER INSERT OR UPDATE ON public.blocker_actions
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('action_point');
DROP TRIGGER IF EXISTS track_activity_actu_lue ON public.news_reads;
CREATE TRIGGER track_activity_actu_lue AFTER INSERT ON public.news_reads
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('actu_lue');
DROP TRIGGER IF EXISTS track_activity_actu_favori ON public.news_favorites;
CREATE TRIGGER track_activity_actu_favori AFTER INSERT ON public.news_favorites
  FOR EACH ROW EXECUTE FUNCTION private.track_activity('actu_favori');

-- Reprise de l'existant (ce qui porte une date et un auteur) pour que les courbes ne partent pas de zéro.
INSERT INTO public.user_activity (user_id, kind, day)
SELECT DISTINCT x.user_id, x.kind, x.day
FROM (
  SELECT author_id AS user_id, 'idee' AS kind, (created_at AT TIME ZONE 'Europe/Paris')::date AS day FROM public.ideas
  UNION ALL SELECT user_id, 'vote', (created_at AT TIME ZONE 'Europe/Paris')::date FROM public.idea_likes
  UNION ALL SELECT author_id, 'commentaire', (created_at AT TIME ZONE 'Europe/Paris')::date FROM public.idea_comments
  UNION ALL SELECT created_by, 'point_bloquant', (created_at AT TIME ZONE 'Europe/Paris')::date FROM public.blockers WHERE created_by IS NOT NULL
  UNION ALL SELECT created_by, 'action_point', (created_at AT TIME ZONE 'Europe/Paris')::date FROM public.blocker_actions WHERE created_by IS NOT NULL
  UNION ALL SELECT user_id, 'actu_lue', (read_at AT TIME ZONE 'Europe/Paris')::date FROM public.news_reads
  UNION ALL SELECT user_id, 'actu_favori', (created_at AT TIME ZONE 'Europe/Paris')::date FROM public.news_favorites
) x
WHERE x.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id)
ON CONFLICT DO NOTHING;

-- 2. Pages vues : un compteur par personne, page et jour ---------------------------
CREATE TABLE IF NOT EXISTS public.page_views (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page text NOT NULL,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, page, day),
  CONSTRAINT page_views_page_check CHECK (page IN ('actus', 'idees', 'points_bloquants', 'trombi'))
);
CREATE INDEX IF NOT EXISTS page_views_day_idx ON public.page_views (day, page);
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
-- Aucune politique : seules les fonctions ci-dessous écrivent et agrègent.
GRANT ALL ON public.page_views TO service_role;

CREATE OR REPLACE FUNCTION public.track_page_view(_page text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_allowed() THEN
    RETURN;
  END IF;
  IF _page NOT IN ('actus', 'idees', 'points_bloquants', 'trombi') THEN
    RETURN;
  END IF;
  INSERT INTO public.page_views (user_id, page, day)
  VALUES (auth.uid(), _page, private.today_fr())
  ON CONFLICT (user_id, page, day) DO UPDATE SET views = public.page_views.views + 1;
END $$;
REVOKE ALL ON FUNCTION public.track_page_view(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_page_view(text) TO authenticated;

-- 3. Feedback : bouton toujours visible sur l'accueil, réponses anonymes ----------------
CREATE TABLE IF NOT EXISTS public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period date NOT NULL,                      -- 1er jour du mois de l'envoi (pas d'horodatage précis)
  question text NOT NULL DEFAULT 'Happy Place t''aide-t-il au quotidien ?',
  score smallint NOT NULL,
  comment text,
  team text,                                 -- équipe au moment de l'envoi (texte, pas de clé étrangère)
  CONSTRAINT feedback_responses_score_check CHECK (score BETWEEN 1 AND 5),
  CONSTRAINT feedback_responses_comment_length CHECK (comment IS NULL OR char_length(comment) <= 1000),
  CONSTRAINT feedback_responses_period_check CHECK (extract(day FROM period) = 1)
);
CREATE INDEX IF NOT EXISTS feedback_responses_period_idx ON public.feedback_responses (period);
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read feedback" ON public.feedback_responses;
CREATE POLICY "Admins read feedback" ON public.feedback_responses
  FOR SELECT TO authenticated USING (private.is_admin());
GRANT SELECT ON public.feedback_responses TO authenticated;
GRANT ALL ON public.feedback_responses TO service_role;
-- Aucune écriture directe : uniquement public.submit_feedback.

-- Chacun peut donner son avis autant de fois qu'il veut (on veut un maximum de retours au début).
CREATE OR REPLACE FUNCTION public.submit_feedback(_score integer, _comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _c text := nullif(btrim(coalesce(_comment, '')), '');
  _w text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.is_allowed(), false) THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  IF _score IS NULL OR _score < 1 OR _score > 5 THEN
    RAISE EXCEPTION 'Choisis une note de 1 à 5.';
  END IF;
  IF _c IS NOT NULL AND char_length(_c) > 1000 THEN
    RAISE EXCEPTION 'Le commentaire est limité à 1000 caractères.';
  END IF;
  IF _c IS NOT NULL THEN
    _w := private.first_blocked_word(_c);
    IF _w IS NOT NULL THEN
      RAISE EXCEPTION 'Le commentaire contient un mot non autorisé : « % ».', _w;
    END IF;
  END IF;
  INSERT INTO public.feedback_responses (period, score, comment, team)
  VALUES (date_trunc('month', private.today_fr())::date, _score, _c, private.my_team());
  INSERT INTO public.user_activity (user_id, kind, day)
  VALUES (auth.uid(), 'feedback', private.today_fr())
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.submit_feedback(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_feedback(integer, text) TO authenticated;

-- 4. Tableau de bord Impact : agrégats seulement, admins seulement -------------------
CREATE OR REPLACE FUNCTION public.impact_dashboard(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _today date := private.today_fr();
  _month0 date := date_trunc('month', private.today_fr())::date;
  _days_c integer := least(greatest(coalesce(_days, 30), 1), 365);
  _total integer;
  _teams integer;
  _result jsonb;
BEGIN
  IF NOT coalesce(private.is_admin(), false) THEN
    RAISE EXCEPTION 'Réservé aux admins.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _total FROM public.allowed_users u
   WHERE u.departure_date IS NULL OR u.departure_date >= _today;
  SELECT count(*) INTO _teams FROM public.teams t WHERE NOT t.is_reserved;

  SELECT jsonb_build_object(
    'total_users', _total,
    'teams_total', _teams,
    'days', _days_c,
    -- Actifs sur 7 jours glissants et 30 jours glissants
    'wau', (SELECT count(DISTINCT user_id) FROM public.user_activity WHERE day > _today - 7),
    'mau', (SELECT count(DISTINCT user_id) FROM public.user_activity WHERE day > _today - 30),
    -- 8 dernières semaines (lundi de la semaine)
    'weekly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('start', w.d, 'active', (
        SELECT count(DISTINCT a.user_id) FROM public.user_activity a
         WHERE a.day >= w.d AND a.day < w.d + 7)) ORDER BY w.d), '[]'::jsonb)
      FROM (SELECT (date_trunc('week', _today)::date - 7 * g) AS d FROM generate_series(0, 7) g) w),
    -- 6 derniers mois
    'monthly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('start', m.d, 'active', (
        SELECT count(DISTINCT a.user_id) FROM public.user_activity a
         WHERE a.day >= m.d AND a.day < (m.d + interval '1 month')::date)) ORDER BY m.d), '[]'::jsonb)
      FROM (SELECT (_month0 - make_interval(months => g))::date AS d FROM generate_series(0, 5) g) m),
    -- Pages vues sur la période demandée
    'pages', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('page', p.page, 'views', p.views, 'visitors', p.visitors)
                                ORDER BY p.views DESC), '[]'::jsonb)
      FROM (
        SELECT pv.page, sum(pv.views)::int AS views, count(DISTINCT pv.user_id)::int AS visitors
        FROM public.page_views pv WHERE pv.day > _today - _days_c GROUP BY pv.page) p),
    'pages_since', (SELECT min(day) FROM public.page_views),
    -- Idées déposées par mois et par équipe (6 derniers mois)
    'ideas_monthly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('month', i.m, 'team', i.team, 'count', i.n)
                                ORDER BY i.m, i.team), '[]'::jsonb)
      FROM (
        SELECT date_trunc('month', created_at AT TIME ZONE 'Europe/Paris')::date AS m, team, count(*)::int AS n
        FROM public.ideas
        WHERE (created_at AT TIME ZONE 'Europe/Paris')::date >= (_month0 - interval '5 months')::date
        GROUP BY 1, 2) i),
    -- Équipes qui déposent au moins une idée, mois par mois
    'team_participation', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('start', m.d, 'teams_with_ideas', (
        SELECT count(DISTINCT i.team) FROM public.ideas i
         JOIN public.teams t ON t.name = i.team AND NOT t.is_reserved
         WHERE (i.created_at AT TIME ZONE 'Europe/Paris')::date >= m.d
           AND (i.created_at AT TIME ZONE 'Europe/Paris')::date < (m.d + interval '1 month')::date)
        ) ORDER BY m.d), '[]'::jsonb)
      FROM (SELECT (_month0 - make_interval(months => g))::date AS d FROM generate_series(0, 5) g) m),
    'teams', (SELECT coalesce(jsonb_agg(t.name ORDER BY t.name), '[]'::jsonb) FROM public.teams t WHERE NOT t.is_reserved),
    -- Sondage
    'feedback', jsonb_build_object(
      'responses', (SELECT count(*) FROM public.feedback_responses),
      'average', (SELECT round(avg(score), 2) FROM public.feedback_responses),
      'distribution', (
        SELECT jsonb_object_agg(s.score::text, coalesce(c.n, 0))
        FROM generate_series(1, 5) s(score)
        LEFT JOIN (SELECT score, count(*)::int AS n FROM public.feedback_responses GROUP BY score) c
               ON c.score = s.score),
      'this_month', (SELECT count(*) FROM public.feedback_responses WHERE period = _month0),
      'monthly', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('start', m.d,
                 'count', (SELECT count(*) FROM public.feedback_responses r WHERE r.period = m.d),
                 'average', (SELECT round(avg(r.score), 2) FROM public.feedback_responses r WHERE r.period = m.d))
               ORDER BY m.d), '[]'::jsonb)
        FROM (SELECT (_month0 - make_interval(months => g))::date AS d FROM generate_series(0, 5) g) m))
  ) INTO _result;
  RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.impact_dashboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.impact_dashboard(integer) TO authenticated;
