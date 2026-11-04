-- ============================================================
-- Connexion par lien e-mail : réservée aux adresses déjà dans la liste des utilisateurs
-- ============================================================
-- Règle décidée avec Daniela (4 novembre 2026) : on ne peut se connecter par e-mail que si
-- l'adresse figure déjà dans allowed_users (liste gérée par les admins) et que la personne n'est pas partie.
-- La page de connexion appelle cette fonction AVANT d'envoyer le lien. Elle est appelable sans être
-- connecté (la personne ne l'est pas encore) et ne renvoie qu'oui/non.

CREATE OR REPLACE FUNCTION public.email_dans_la_liste(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users au
    WHERE au.email = lower(btrim(coalesce(_email, '')))
      AND (au.departure_date IS NULL
           OR au.departure_date > (now() AT TIME ZONE 'Europe/Paris')::date)
  )
$$;

REVOKE ALL ON FUNCTION public.email_dans_la_liste(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_dans_la_liste(text) TO anon, authenticated;
