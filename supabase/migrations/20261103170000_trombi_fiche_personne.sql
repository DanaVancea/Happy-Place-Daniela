-- ============================================================
-- Trombi : fiche d'une personne (manager de l'équipe)
-- ============================================================
-- Nouvelle fonction (team_directory() n'est pas modifiée) : liste, pour chaque équipe,
-- le ou les managers. Le front s'en sert avec l'annuaire pour afficher, dans la fiche d'une
-- personne, son manager et les autres membres de son équipe.
-- Aucune adresse e-mail ni date de départ exposée.

CREATE OR REPLACE FUNCTION public.team_managers()
RETURNS TABLE (
  first_name text,
  last_name text,
  team text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT u.first_name, u.last_name, mt.team
  FROM public.manager_teams mt
  JOIN public.allowed_users u ON u.id = mt.allowed_user_id
  WHERE private.is_allowed()
    AND u.first_name IS NOT NULL
    AND u.last_name IS NOT NULL
    AND (u.departure_date IS NULL OR u.departure_date >= current_date)
  ORDER BY mt.team, u.last_name, u.first_name
$$;

REVOKE ALL ON FUNCTION public.team_managers() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.team_managers() TO authenticated;
