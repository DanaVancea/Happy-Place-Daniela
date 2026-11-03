-- ============================================================
-- Alertes de départ : réservées aux admins et managers, avec le nom de la personne
-- ============================================================
-- * Un compte qui n'est plus manager ni admin (par exemple un manager repassé
--   collaborateur) ne voit plus d'alerte de départ : la lecture est limitée par rôle.
-- * L'alerte affiche le prénom et le nom plutôt que l'adresse e-mail.

DROP POLICY IF EXISTS "Recipients and admins read departure notices" ON public.departure_notices;
CREATE POLICY "Recipients and admins read departure notices" ON public.departure_notices
  FOR SELECT TO authenticated
  USING (
    private.is_admin()
    OR (private.current_app_role() = 'manager'::public.app_role
        AND recipient_email = lower(auth.jwt() ->> 'email'))
  );

CREATE OR REPLACE FUNCTION private.notify_departure(_user_id uuid, _email text, _team text, _date date, _kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $function$
DECLARE
  _docs jsonb := private.departure_documents(_email);
  _label text := coalesce(
    (SELECT nullif(btrim(concat_ws(' ', first_name, last_name)), '') FROM public.allowed_users WHERE id = _user_id),
    _email);
BEGIN
  UPDATE public.departure_notices SET closed_at = now()
   WHERE departing_user_id = _user_id AND closed_at IS NULL;
  INSERT INTO public.departure_notices (departing_user_id, departing_label, recipient_email, departure_date, kind, documents)
  SELECT _user_id, _label, rcpt, _date, _kind, _docs FROM private.departure_recipients(_email, _team) AS rcpt;
END $function$;

-- Alertes déjà ouvertes : afficher le nom au lieu de l'adresse
UPDATE public.departure_notices n
   SET departing_label = nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
  FROM public.allowed_users u
 WHERE u.id = n.departing_user_id AND n.closed_at IS NULL
   AND nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') IS NOT NULL;
