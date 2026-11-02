-- ============================================================
-- Page Actualités : à la une, niveaux, publication programmée, favoris, « Lu »
-- ============================================================
-- Règles décidées avec Daniela (2 novembre 2026) :
--   * seuls les Admin écrivent, programment et publient les actualités
--     (un manager ne peut plus créer de brouillon) ;
--   * une actualité a un chapô, un département (RH / DSI / Office management),
--     un niveau (information / important / urgent), peut être épinglée à la une
--     (4 maximum côté interface) et programmée (publish_at dans le futur) ;
--   * chaque personne a ses favoris (privés) et marque une actualité « Lue » ;
--     seul l'Admin voit le nombre de lectures (sans noms).

-- 1. Nouvelles colonnes sur les actualités ----------------------------------
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'information',
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS featured_until timestamptz;

ALTER TABLE public.news DROP CONSTRAINT IF EXISTS news_level_check;
ALTER TABLE public.news
  ADD CONSTRAINT news_level_check CHECK (level IN ('information', 'important', 'urgent'));

-- 2. Droits : Admin seul sur l'écriture, lecture des publiées échues ----------
DROP POLICY IF EXISTS "Manager insert own draft news" ON public.news;
DROP POLICY IF EXISTS "Manager update own draft news" ON public.news;
DROP POLICY IF EXISTS "Manager delete own draft news" ON public.news;
DROP POLICY IF EXISTS "Allowed read published news" ON public.news;

CREATE POLICY "Allowed read published news" ON public.news
  FOR SELECT TO authenticated
  USING (
    private.is_allowed()
    AND (
      private.is_admin()
      OR (status = 'publiée'::news_status AND (publish_at IS NULL OR publish_at <= now()))
    )
  );
-- (la politique « Admin write » existante reste en place)

-- 3. Favoris : privés ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.news_favorites (
  news_id uuid NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (news_id, user_id)
);
ALTER TABLE public.news_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own favorites read" ON public.news_favorites
  FOR SELECT TO authenticated USING (private.is_allowed() AND user_id = auth.uid());
CREATE POLICY "Own favorites insert" ON public.news_favorites
  FOR INSERT TO authenticated WITH CHECK (private.is_allowed() AND user_id = auth.uid());
CREATE POLICY "Own favorites delete" ON public.news_favorites
  FOR DELETE TO authenticated USING (private.is_allowed() AND user_id = auth.uid());

-- 4. « Lu » : marque personnelle, comptage agrégé pour l'Admin ----------------
CREATE TABLE IF NOT EXISTS public.news_reads (
  news_id uuid NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (news_id, user_id)
);
ALTER TABLE public.news_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own reads read" ON public.news_reads
  FOR SELECT TO authenticated USING (private.is_allowed() AND user_id = auth.uid());
CREATE POLICY "Own reads insert" ON public.news_reads
  FOR INSERT TO authenticated WITH CHECK (private.is_allowed() AND user_id = auth.uid());
CREATE POLICY "Own reads delete" ON public.news_reads
  FOR DELETE TO authenticated USING (private.is_allowed() AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.news_read_counts()
RETURNS TABLE (news_id uuid, reads bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT r.news_id, count(*) FROM public.news_reads r
  WHERE private.is_admin()
  GROUP BY r.news_id
$$;
REVOKE ALL ON FUNCTION public.news_read_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.news_read_counts() TO authenticated;

REVOKE ALL ON public.news_favorites, public.news_reads FROM anon;
GRANT SELECT, INSERT, DELETE ON public.news_favorites, public.news_reads TO authenticated;
