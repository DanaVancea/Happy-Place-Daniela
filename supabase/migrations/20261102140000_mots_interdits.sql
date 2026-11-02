-- ============================================================
-- Mots interdits : une actualité qui en contient ne peut pas être publiée
-- ============================================================
-- * La liste vit dans public.blocked_words (modifiable par un Admin, par exemple
--   depuis le Table Editor de Supabase) : une ligne = un mot ou une expression.
-- * Comparaison sans accents ni majuscules, sur des mots entiers
--   (le pluriel en « s » ou « x » est aussi détecté).
-- * Le contrôle porte sur le titre, le chapô et le texte, uniquement à la
--   publication ou à la programmation : un brouillon reste enregistrable.

CREATE TABLE IF NOT EXISTS public.blocked_words (
  word text PRIMARY KEY CHECK (word = lower(btrim(word)) AND word <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage blocked words" ON public.blocked_words;
CREATE POLICY "Admin manage blocked words" ON public.blocked_words
  FOR ALL TO authenticated
  USING (private.is_allowed() AND private.is_admin())
  WITH CHECK (private.is_allowed() AND private.is_admin());
REVOKE ALL ON public.blocked_words FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_words TO authenticated;

-- Texte sans accents, en minuscules, espaces simplifiés
CREATE OR REPLACE FUNCTION private.fold_text(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(_t, '')),
              'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
              'aaaaaaceeeeiiiinooooouuuuyyoa'),
    '\s+', ' ', 'g'))
$$;

-- Premier mot interdit trouvé dans un texte (NULL s'il n'y en a pas)
CREATE OR REPLACE FUNCTION private.first_blocked_word(_t text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT w.word
  FROM public.blocked_words w
  WHERE private.fold_text(_t) ~
        ('(^|[^a-z0-9])' ||
         regexp_replace(private.fold_text(w.word), '([.^$|?*+()\[\]{}\\])', '\\\1', 'g') ||
         '(s|x)?([^a-z0-9]|$)')
  ORDER BY w.word
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.check_news_blocked_words()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _w text;
BEGIN
  IF NEW.status = 'publiée'::news_status THEN
    _w := private.first_blocked_word(concat_ws(' ', NEW.title, NEW.summary, NEW.body));
    IF _w IS NOT NULL THEN
      RAISE EXCEPTION 'Publication bloquée : le mot « % » n''est pas autorisé.', _w
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS check_news_blocked_words ON public.news;
CREATE TRIGGER check_news_blocked_words
  BEFORE INSERT OR UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION private.check_news_blocked_words();

REVOKE ALL ON FUNCTION private.fold_text(text), private.first_blocked_word(text),
  private.check_news_blocked_words() FROM PUBLIC, anon, authenticated;

-- Liste de départ (à compléter selon vos besoins)
INSERT INTO public.blocked_words (word) VALUES
  ('connard'), ('connasse'), ('con'), ('salope'), ('salaud'), ('putain'), ('pute'),
  ('merde'), ('enculé'), ('enculer'), ('enfoiré'), ('bâtard'), ('fdp'), ('ntm'),
  ('nique'), ('niquer'), ('bite'), ('couille'), ('couilles'), ('branleur'), ('bordel'),
  ('pédé'), ('tapette'), ('gouine'), ('crétin'), ('abruti'), ('débile'), ('imbécile'),
  ('ordure'), ('trou du cul'), ('ta gueule'), ('ferme ta gueule'), ('va te faire foutre')
ON CONFLICT DO NOTHING;
