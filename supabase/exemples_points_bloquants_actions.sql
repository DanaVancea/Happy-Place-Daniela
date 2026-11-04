-- Données de test : des actions pour les points bloquants déjà existants.
-- À exécuter une fois dans l'éditeur SQL de Supabase (rejouable : ne touche que les points sans action).
-- Les responsables sont pris parmi les comptes existants (allowed_users), toutes équipes confondues.
DO $$
DECLARE
  _b record;
  _owners text[];
  _names text[];
  _n int;
  _i int := 0;
BEGIN
  SELECT array_agg(email ORDER BY email),
         array_agg(coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), email) ORDER BY email)
    INTO _owners, _names
  FROM public.allowed_users
  WHERE departure_date IS NULL OR departure_date >= current_date;
  _n := coalesce(array_length(_owners, 1), 0);
  IF _n = 0 THEN
    RAISE NOTICE 'Aucun compte dans allowed_users : rien à insérer.';
    RETURN;
  END IF;

  FOR _b IN
    SELECT id FROM public.blockers b
    WHERE NOT EXISTS (SELECT 1 FROM public.blocker_actions a WHERE a.blocker_id = b.id)
    ORDER BY b.created_at
  LOOP
    INSERT INTO public.blocker_actions (blocker_id, title, status, due_date, owner_email, owner_name) VALUES
      (_b.id, 'Poser un premier diagnostic partagé avec l''équipe', 'faite',
        current_date - 5, _owners[(_i % _n) + 1], _names[(_i % _n) + 1]),
      (_b.id, 'Valider le plan de remédiation avec les parties prenantes', 'en cours',
        current_date + 3, _owners[((_i + 1) % _n) + 1], _names[((_i + 1) % _n) + 1]),
      (_b.id, 'Faire un point de suivi et communiquer le résultat', 'prévue',
        current_date + 10, _owners[((_i + 2) % _n) + 1], _names[((_i + 2) % _n) + 1]);
    _i := _i + 1;
  END LOOP;
END $$;
