-- ============================================================
-- Indicateurs : cible, sens du bon résultat, définition, historique de démonstration
-- ============================================================
-- * target    : valeur cible (maintenue dans le Google Sheet, colonne « cible »)
-- * direction : « hausse » (plus haut = mieux) ou « baisse » (plus bas = mieux),
--               colonne « sens » du Google Sheet
-- * definition: phrase « comment lire ce chiffre »
-- * metrics_history.is_demo : relevés fictifs, faciles à retirer d'un coup :
--     DELETE FROM public.metrics_history WHERE is_demo;

ALTER TABLE public.metrics
  ADD COLUMN IF NOT EXISTS target numeric,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'hausse',
  ADD COLUMN IF NOT EXISTS definition text;
ALTER TABLE public.metrics DROP CONSTRAINT IF EXISTS metrics_direction_check;
ALTER TABLE public.metrics
  ADD CONSTRAINT metrics_direction_check CHECK (direction IN ('hausse', 'baisse'));

ALTER TABLE public.metrics_history ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.metrics_with_trend WITH (security_invoker = true) AS
 SELECT m.key,
    m.label,
    m.value,
    m.unit,
    m.updated_at,
    p.value AS previous_value,
        CASE
            WHEN p.value IS NULL OR p.value = m.value THEN 'stable'::text
            WHEN m.value > p.value THEN 'hausse'::text
            ELSE 'baisse'::text
        END AS trend,
        CASE
            WHEN p.value IS NULL THEN NULL::numeric
            ELSE m.value - p.value
        END AS delta,
    m.target,
    m.direction,
    m.definition
   FROM public.metrics m
     LEFT JOIN LATERAL ( SELECT h.value
           FROM public.metrics_history h
          WHERE h.metric_key = m.key
          ORDER BY h.recorded_at DESC
         OFFSET 1
         LIMIT 1) p ON true;

-- Cibles, sens et définitions (valeurs fictives de démonstration)
UPDATE public.metrics AS m SET target = v.target, direction = v.direction, definition = v.definition
FROM (VALUES
  ('training_kpi',   56,  'hausse', 'Part des candidats présentés à un client qui sont placés en mission. Suivi par la Direction Recrutement.'),
  ('active_users',   45,  'hausse', 'Nombre moyen de missions en cours chez nos clients sur le mois.'),
  ('nps',            80,  'hausse', 'Score de recommandation des candidats après un processus de recrutement, de -100 à 100.'),
  ('engagement',     80,  'hausse', 'Part des offres envoyées qui sont acceptées par les candidats.'),
  ('turnover',       25,  'baisse', 'Nombre moyen de jours entre l''ouverture d''un poste et la signature du candidat. Plus il est bas, mieux c''est.'),
  ('absenteeism',    40,  'hausse', 'Part des candidats contactés qui répondent à notre première prise de contact.'),
  ('open_positions', 80,  'hausse', 'Nombre de postes clients en recherche active : il mesure le volume d''activité.'),
  ('training_hours', 220, 'hausse', 'Nombre d''entretiens de candidats menés par l''équipe sur le mois.')
) AS v(key, target, direction, definition)
WHERE m.key = v.key;

-- Historique fictif : 11 relevés mensuels (15 décembre 2025 → 15 octobre 2026) par indicateur
DELETE FROM public.metrics_history WHERE is_demo;
INSERT INTO public.metrics_history (metric_key, value, recorded_at, is_demo)
SELECT v.k,
       round((v.s0 + (m.value - v.s0) * g / 10.0
              + sin(g * 1.9 + length(v.k)) * abs(m.value - v.s0) * 0.15)::numeric, v.d),
       make_date(2025, 12, 15)::timestamptz + (g || ' months')::interval,
       true
FROM (VALUES
  ('training_kpi',   31.5, 1),
  ('active_users',   27.0, 1),
  ('nps',            58.0, 0),
  ('engagement',     72.0, 1),
  ('turnover',       41.0, 0),
  ('absenteeism',    19.0, 1),
  ('open_positions', 44.0, 0),
  ('training_hours', 142.0, 0)
) AS v(k, s0, d)
JOIN public.metrics m ON m.key = v.k
CROSS JOIN generate_series(0, 10) AS g;

-- ============================================================
-- Synchronisation Google Sheets : colonnes repérées par leur titre
-- ============================================================
CREATE OR REPLACE FUNCTION private.csv_fields(_line text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _fields text[] := ARRAY[]::text[];
  _m text[];
BEGIN
  FOR _m IN SELECT regexp_matches(_line || ',', '("(?:[^"]|"")*"|[^,]*),', 'g') LOOP
    _fields := _fields || replace(regexp_replace(_m[1], '^"(.*)"$', '\1'), '""', '"');
  END LOOP;
  RETURN _fields;
END
$$;

-- Nombre accepté avec virgule décimale, espaces et signe %
CREATE OR REPLACE FUNCTION private.csv_number(_raw text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN c ~ '^-?[0-9]+(\.[0-9]+)?$' THEN c::numeric END
  FROM (SELECT replace(regexp_replace(coalesce(_raw, ''), '[\s% ]', '', 'g'), ',', '.') AS c) s
$$;

CREATE OR REPLACE FUNCTION private.sync_metrics_from_csv()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, private, extensions
AS $$
DECLARE
  _url text;
  _res extensions.http_response;
  _line text;
  _f text[];
  _h text[];
  _i int;
  _loc text;
  _ic int := 1; _iv int := 3; _it int; _is int;
  _key text;
  _val numeric;
  _tgt numeric;
  _dir text;
  _updated int := 0;
  _ignored int := 0;
  _first boolean := true;
BEGIN
  SELECT url INTO _url FROM private.indicator_sync WHERE id;
  IF _url IS NULL THEN RETURN 'aucune source'; END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  FOR _i IN 1..4 LOOP
    _res := extensions.http_get(_url);
    EXIT WHEN _res.status NOT BETWEEN 300 AND 399;
    SELECT h.value INTO _loc FROM unnest(_res.headers) h WHERE lower(h.field) = 'location' LIMIT 1;
    EXIT WHEN _loc IS NULL;
    _url := _loc;
  END LOOP;

  IF _res.status <> 200 OR _res.content IS NULL THEN
    UPDATE private.indicator_sync SET last_run = now(), last_status = 'erreur HTTP ' || coalesce(_res.status::text, '?') WHERE id;
    RETURN 'erreur HTTP ' || coalesce(_res.status::text, '?');
  END IF;

  FOREACH _line IN ARRAY regexp_split_to_array(replace(_res.content, E'\r', ''), E'\n') LOOP
    IF btrim(_line) = '' THEN CONTINUE; END IF;
    _f := private.csv_fields(_line);

    IF _first THEN
      _first := false;
      -- Colonnes repérées par leur titre (cle, valeur, cible, sens)
      _h := ARRAY(SELECT lower(btrim(x)) FROM unnest(_f) AS x);
      _ic := coalesce(array_position(_h, 'cle'), 1);
      _iv := coalesce(array_position(_h, 'valeur'), 3);
      _it := array_position(_h, 'cible');
      _is := array_position(_h, 'sens');
      CONTINUE;
    END IF;

    _key := btrim(coalesce(_f[_ic], ''));
    _val := private.csv_number(_f[_iv]);
    _tgt := CASE WHEN _it IS NOT NULL THEN private.csv_number(_f[_it]) END;
    _dir := CASE WHEN _is IS NOT NULL AND lower(btrim(coalesce(_f[_is], ''))) IN ('hausse', 'baisse')
                 THEN lower(btrim(_f[_is])) END;

    IF _key = '' OR _val IS NULL OR NOT EXISTS (SELECT 1 FROM public.metrics WHERE key = _key) THEN
      _ignored := _ignored + 1;
      CONTINUE;
    END IF;

    UPDATE public.metrics
       SET value = _val,
           target = coalesce(_tgt, target),
           direction = coalesce(_dir, direction),
           updated_at = CASE WHEN value IS DISTINCT FROM _val THEN now() ELSE updated_at END
     WHERE key = _key
       AND (value IS DISTINCT FROM _val
            OR target IS DISTINCT FROM coalesce(_tgt, target)
            OR direction IS DISTINCT FROM coalesce(_dir, direction));
    IF FOUND THEN _updated := _updated + 1; END IF;
  END LOOP;

  UPDATE private.indicator_sync
     SET last_run = now(), last_status = 'ok', last_updated = _updated, last_ignored = _ignored
   WHERE id;
  RETURN format('ok : %s mis à jour, %s ignorés', _updated, _ignored);
END
$$;

REVOKE ALL ON FUNCTION private.sync_metrics_from_csv() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.csv_fields(text), private.csv_number(text) FROM PUBLIC, anon, authenticated;
