-- Correctif : la page Points bloquants était indisponible pour tous les comptes.
-- Les politiques RLS appellent ces fonctions avec le compte connecté (rôle authenticated),
-- qui n'avait pas le droit de les exécuter (« permission denied for function »).
GRANT EXECUTE ON FUNCTION private.can_edit_blocker_team(text), private.can_read_blocker(text, uuid),
  private.can_read_blocker_id(uuid), private.can_edit_blocker_id(uuid) TO authenticated;
