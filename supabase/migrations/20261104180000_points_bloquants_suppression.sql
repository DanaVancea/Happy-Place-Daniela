-- Suppression d'un point bloquant : l'admin (tous les points) ou le manager qui l'a créé
-- (et qui gère toujours l'équipe concernée). Décidé avec Daniela, 4 novembre 2026.
DROP POLICY IF EXISTS "Delete blockers" ON public.blockers;
CREATE POLICY "Delete blockers" ON public.blockers FOR DELETE TO authenticated
  USING (
    private.can_read_blocker(sensitive_team, created_by)
    AND (
      private.is_admin()
      OR (created_by = auth.uid() AND private.can_edit_blocker_team(department))
    )
  );
