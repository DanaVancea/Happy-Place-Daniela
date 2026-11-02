-- ============================================================
-- Trombi : annuaire des équipes lisible par toute personne connectée avec un rôle
-- ============================================================
-- allowed_users n'est lisible que par son propriétaire et par les admins.
-- Cette fonction expose uniquement ce qui sert au trombi (prénom, nom, équipe,
-- rôle, date d'arrivée). Elle n'expose ni l'adresse e-mail ni la date de départ.
-- Les personnes déjà parties (departure_date passée) n'apparaissent plus.

CREATE OR REPLACE FUNCTION public.team_directory()
RETURNS TABLE (
  first_name text,
  last_name text,
  team text,
  role public.app_role,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT u.first_name, u.last_name, u.team, r.role, u.created_at
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
