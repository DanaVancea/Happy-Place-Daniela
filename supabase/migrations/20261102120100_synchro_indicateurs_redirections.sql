-- Correctif : suivre les redirections de Google à la main (l'option automatique n'est pas autorisée).
CREATE OR REPLACE FUNCTION private.sync_metrics_from_csv()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, private, extensions
AS $$
DECLARE
  _url text;
  _res extensions.http_response;
  _line text;
  _fields text[];
  _m text[];
  _key text;
  _raw text;
  _val numeric;
  _updated int := 0;
  _ignored int := 0;
  _first boolean := true;
  _i int;
  _loc text;
BEGIN
  SELECT url INTO _url FROM private.indicator_sync WHERE id;
  IF _url IS NULL THEN RETURN 'aucune source'; END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  -- Google redirige le lien publié vers un autre serveur : on suit jusqu'à 3 redirections.
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
    IF _first THEN _first := false; CONTINUE; END IF; -- ligne de titres

    -- Découpe d'une ligne CSV (champs entre guillemets acceptés)
    _fields := ARRAY[]::text[];
    FOR _m IN SELECT regexp_matches(_line || ',', '("(?:[^"]|"")*"|[^,]*),', 'g') LOOP
      _fields := _fields || replace(regexp_replace(_m[1], '^"(.*)"$', '\1'), '""', '"');
    END LOOP;

    _key := btrim(coalesce(_fields[1], ''));
    -- valeur : on accepte la virgule décimale, les espaces et le signe %
    _raw := replace(regexp_replace(coalesce(_fields[3], ''), '[\s% ]', '', 'g'), ',', '.');

    IF _key = '' OR _raw !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      _ignored := _ignored + 1;
      CONTINUE;
    END IF;
    _val := _raw::numeric;

    UPDATE public.metrics SET value = _val, updated_at = now()
     WHERE key = _key AND value IS DISTINCT FROM _val;
    IF FOUND THEN
      _updated := _updated + 1;
    ELSIF NOT EXISTS (SELECT 1 FROM public.metrics WHERE key = _key) THEN
      _ignored := _ignored + 1;
    END IF;
  END LOOP;

  UPDATE private.indicator_sync
     SET last_run = now(), last_status = 'ok', last_updated = _updated, last_ignored = _ignored
   WHERE id;
  RETURN format('ok : %s mis à jour, %s ignorés', _updated, _ignored);
END
$$;

REVOKE ALL ON FUNCTION private.sync_metrics_from_csv() FROM PUBLIC, anon, authenticated;
