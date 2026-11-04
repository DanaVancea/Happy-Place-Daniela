-- Archivage des actualités (décidé avec Daniela, 4 novembre 2026) :
-- un admin peut archiver une actualité (elle disparaît du fil, reste consultable par les admins),
-- la restaurer ou la supprimer définitivement.
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP POLICY IF EXISTS "Allowed read published news" ON public.news;
CREATE POLICY "Allowed read published news" ON public.news
  FOR SELECT TO authenticated
  USING (
    private.is_allowed()
    AND (
      private.is_admin()
      OR (status = 'publiée'::news_status AND archived_at IS NULL AND (publish_at IS NULL OR publish_at <= now()))
    )
  );
