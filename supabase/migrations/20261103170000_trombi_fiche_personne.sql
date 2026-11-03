-- ============================================================
-- Trombi : fiche d'une personne (manager, équipe, date d'entrée)
-- ============================================================
-- Ajoute à l'annuaire la liste des équipes managées par chaque personne (managed_teams).
-- Le front en déduit le ou les managers d'une équipe et les autres membres de l'équipe.
-- Toujours aucune adresse e-mail ni date de départ exposée.

DROP FUNCTION IF EXISTS public.team_directory();

CREATE FUNCTION public.team_directory()
RETURNS TABLE (
  first_name text,
  last_name text,
  team text,
  role public.app_role,
  joined_at timestamptz,
  managed_teams text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT u.first_name, u.last_name, u.team, r.role, u.created_at,
    COALESCE(
      (SELECT array_agg(mt.team ORDER BY mt.team)
         FROM public.manager_teams mt WHERE mt.allowed_user_id = u.id),
      '{}'::text[]
    )
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
