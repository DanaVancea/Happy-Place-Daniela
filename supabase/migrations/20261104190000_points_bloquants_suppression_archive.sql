-- « Supprimer » un point bloquant l'envoie dans l'archive (décidé avec Daniela, 4 novembre 2026) :
-- un point peut donc être archivé quel que soit son statut (et plus seulement quand il est résolu).
DROP TRIGGER IF EXISTS check_blocker_archive ON public.blockers;
