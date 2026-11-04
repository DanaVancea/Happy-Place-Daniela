-- Correctif : passer un point en « Privé » échouait (« violates foreign key constraint
-- blockers_sensitive_team_fkey ») quand l'équipe du point (colonne department, texte libre
-- hérité, ex. « PRODUCT TEAM ») n'existe pas dans la table teams.
-- La visibilité privée reprend simplement le texte de l'équipe du point : on retire la clé étrangère.
ALTER TABLE public.blockers DROP CONSTRAINT IF EXISTS blockers_sensitive_team_fkey;
