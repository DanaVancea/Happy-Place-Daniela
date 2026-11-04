-- ============================================================
-- Avis : deux champs libres, « Qu'est-ce que tu aimes ? » et « Qu'est-ce que nous pouvons améliorer ? »
-- ============================================================
-- Décidé avec Daniela (4 novembre 2026) : le formulaire distingue ce qui plaît de ce qui doit
-- s'améliorer. Au moins un des deux champs est rempli. Les avis déjà reçus (un seul texte) passent
-- dans « À améliorer ». Toujours anonyme : aucune colonne ne relie un avis à une personne.

ALTER TABLE public.feedback_responses RENAME COLUMN comment TO improve;
ALTER TABLE public.feedback_responses ALTER COLUMN improve DROP NOT NULL;
ALTER TABLE public.feedback_responses ADD COLUMN IF NOT EXISTS liked text;

ALTER TABLE public.feedback_responses DROP CONSTRAINT IF EXISTS feedback_responses_comment_length;
ALTER TABLE public.feedback_responses DROP CONSTRAINT IF EXISTS feedback_responses_texts_check;
ALTER TABLE public.feedback_responses ADD CONSTRAINT feedback_responses_texts_check CHECK (
  (liked IS NOT NULL OR improve IS NOT NULL)
  AND (liked IS NULL OR char_length(liked) BETWEEN 3 AND 1000)
  AND (improve IS NULL OR char_length(improve) BETWEEN 3 AND 1000));

DROP FUNCTION IF EXISTS public.submit_feedback(text);
CREATE OR REPLACE FUNCTION public.submit_feedback(_liked text, _improve text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _l text := nullif(btrim(coalesce(_liked, '')), '');
  _i text := nullif(btrim(coalesce(_improve, '')), '');
  _w text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.is_allowed(), false) THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  IF _l IS NULL AND _i IS NULL THEN
    RAISE EXCEPTION 'Écris quelques mots dans au moins un des deux champs.';
  END IF;
  IF (_l IS NOT NULL AND char_length(_l) < 3) OR (_i IS NOT NULL AND char_length(_i) < 3) THEN
    RAISE EXCEPTION 'Écris quelques mots (3 caractères au minimum).';
  END IF;
  IF coalesce(char_length(_l), 0) > 1000 OR coalesce(char_length(_i), 0) > 1000 THEN
    RAISE EXCEPTION 'Chaque champ est limité à 1000 caractères.';
  END IF;
  _w := private.first_blocked_word(concat_ws(' ', _l, _i));
  IF _w IS NOT NULL THEN
    RAISE EXCEPTION 'Ton avis contient un mot non autorisé : « % ».', _w;
  END IF;
  INSERT INTO public.feedback_responses (period, liked, improve, team)
  VALUES (date_trunc('month', private.today_fr())::date, _l, _i, private.my_team());
  INSERT INTO public.user_activity (user_id, kind, day)
  VALUES (auth.uid(), 'feedback', private.today_fr())
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.submit_feedback(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_feedback(text, text) TO authenticated;
