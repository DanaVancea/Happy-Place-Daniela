-- ============================================================
-- « Voici ce que vos idées ont changé » : articles Actu liés à une idée validée,
-- et badge « idée validée » sur le Trombi
-- ============================================================
-- Règles décidées avec Daniela (3 novembre 2026) :
--   * un article Actu peut être « né d'une idée » : seuls les admins (qui publient les
--     actus) font le lien, et seulement vers une idée validée ;
--   * le lien peut être posé longtemps après la validation de l'idée ;
--   * l'encart de la Boîte à idées est visible de tous et crédite la personne
--     (sans montrer le texte de l'idée) ;
--   * le Trombi affiche un badge « idée validée » sur le profil de l'auteur.

-- 1. Lien article -> idée -----------------------------------------------------
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS idea_id uuid REFERENCES public.ideas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS news_idea_idx ON public.news (idea_id) WHERE idea_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.check_news_idea()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.idea_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.idea_id IS DISTINCT FROM OLD.idea_id)
     AND NOT EXISTS (SELECT 1 FROM public.ideas i WHERE i.id = NEW.idea_id AND i.status = 'validée') THEN
    RAISE EXCEPTION 'Une actualité ne peut être liée qu''à une idée validée.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_news_idea ON public.news;
CREATE TRIGGER check_news_idea BEFORE INSERT OR UPDATE OF idea_id ON public.news
  FOR EACH ROW EXECUTE FUNCTION private.check_news_idea();
REVOKE ALL ON FUNCTION private.check_news_idea() FROM PUBLIC, anon, authenticated;

-- 2. Articles liés à une idée : lisible par tous, sans le texte de l'idée -------
CREATE OR REPLACE FUNCTION public.idea_impact_articles()
RETURNS TABLE (
  news_id uuid,
  title text,
  summary text,
  department text,
  published_at timestamptz,
  author_name text,
  team text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT n.id, n.title, n.summary, n.department,
         coalesce(n.publish_at, n.created_at), i.author_name, i.team
  FROM public.news n
  JOIN public.ideas i ON i.id = n.idea_id
  WHERE private.is_allowed()
    AND n.status = 'publiée'::news_status
    AND (n.publish_at IS NULL OR n.publish_at <= now())
    AND i.status = 'validée'
  ORDER BY coalesce(n.publish_at, n.created_at) DESC
  LIMIT 6
$$;
REVOKE ALL ON FUNCTION public.idea_impact_articles() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.idea_impact_articles() TO authenticated;

-- 3. Trombi : nombre d'idées validées par personne ---------------------------
DROP FUNCTION IF EXISTS public.team_directory();
CREATE OR REPLACE FUNCTION public.team_directory()
RETURNS TABLE (
  first_name text,
  last_name text,
  team text,
  role public.app_role,
  joined_at timestamptz,
  validated_ideas bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT u.first_name, u.last_name, u.team, r.role, u.created_at,
         (SELECT count(*) FROM public.ideas i
           WHERE i.author_email = u.email AND i.status = 'validée')
  FROM public.allowed_users u
  JOIN public.allowed_user_roles r ON r.allowed_user_id = u.id
  WHERE private.is_allowed()
    AND u.first_name IS NOT NULL
    AND u.last_name IS NOT NULL
    AND (u.departure_date IS NULL OR u.departure_date >= current_date)
  ORDER BY u.team, u.last_name, u.first_name
$$;
REVOKE ALL ON FUNCTION public.team_directory() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.team_directory() TO authenticated;
