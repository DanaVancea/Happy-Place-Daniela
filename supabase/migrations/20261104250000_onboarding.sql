-- ============================================================
-- Parcours d'onboarding : afficher une seule fois par compte
-- ============================================================
-- Une ligne par compte une fois le parcours terminé ou passé. Sans ligne = parcours jamais vu.
-- Relancer le parcours depuis le lien « Aide » ne change pas cet état.

CREATE TABLE IF NOT EXISTS public.onboarding_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  skipped boolean NOT NULL DEFAULT false
);

ALTER TABLE public.onboarding_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lire son propre onboarding" ON public.onboarding_status
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Écriture uniquement via la fonction ci-dessous (pas d'INSERT/UPDATE direct)
CREATE OR REPLACE FUNCTION public.terminer_onboarding(_skipped boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.onboarding_status (user_id, skipped)
  VALUES (auth.uid(), coalesce(_skipped, false))
  ON CONFLICT (user_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.terminer_onboarding(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminer_onboarding(boolean) TO authenticated;
