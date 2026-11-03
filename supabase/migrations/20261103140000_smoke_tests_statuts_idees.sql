-- ============================================================
-- Test de fumée : ne plus signaler les statuts d'idées comme « ENUM obsolète »
-- ============================================================
-- private.audit_enum_literals() compare chaque valeur de statut écrite dans une fonction
-- aux valeurs des ENUM. Or ideas.status est une colonne texte (contrainte CHECK), pas un
-- ENUM : « en débat » et « remontée » étaient donc signalés à tort (4 anomalies dans
-- private.can_read_idea et public.moderate_idea). Seule la liste des valeurs connues change :
-- on y ajoute les statuts de la contrainte ideas_status_check.

CREATE OR REPLACE FUNCTION private.audit_enum_literals()
RETURNS TABLE(fonction text, valeur text, probleme text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _f record;
  _m text[];
  _labels text[];
  _ok boolean;
BEGIN
  SELECT array_agg(e.enumlabel) INTO _labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public';
  -- Statuts d'idées : colonne texte contrainte par ideas_status_check, pas un ENUM
  _labels := _labels || ARRAY['en attente', 'validée', 'en débat', 'remontée', 'supprimée'];

  FOR _f IN
    SELECT n.nspname || '.' || p.proname AS fn, p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
      AND l.lanname IN ('plpgsql', 'sql')
      AND p.proname NOT IN ('audit_enum_literals', 'run_smoke_tests')
  LOOP
    -- a) valeur castée explicitement vers un ENUM : 'x'::public.mon_enum
    FOR _m IN SELECT regexp_matches(_f.prosrc, '''((?:[^'']|'''')*)''::(?:public\.)?(\w+)', 'g') LOOP
      IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = _m[2] AND t.typtype = 'e') THEN
        SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                       JOIN pg_namespace n ON n.oid = t.typnamespace
                       WHERE n.nspname = 'public' AND t.typname = _m[2]
                         AND e.enumlabel = replace(_m[1], '''''', '''')) INTO _ok;
        IF NOT _ok THEN
          fonction := _f.fn; valeur := replace(_m[1], '''''', '''');
          probleme := 'Valeur absente de l''ENUM ' || _m[2];
          RETURN NEXT;
        END IF;
      END IF;
    END LOOP;
    -- b) comparaison non typée sur une colonne d'ENUM : status = 'x', role IN ('x', 'y')…
    FOR _m IN SELECT regexp_matches(_f.prosrc,
        '\m_?(?:status|old_status|new_status|role|severity|rejection_category)\s*(?:=|<>|!=)\s*''((?:[^'']|'''')*)''(?!::)', 'g') LOOP
      IF NOT (replace(_m[1], '''''', '''') = ANY(_labels)) THEN
        fonction := _f.fn; valeur := replace(_m[1], '''''', '''');
        probleme := 'Comparaison à une valeur qui n''existe dans aucun ENUM';
        RETURN NEXT;
      END IF;
    END LOOP;
    FOR _m IN SELECT regexp_matches(_f.prosrc,
        '\m_?(?:status|old_status|new_status|role|severity|rejection_category)\s+(?:NOT\s+)?IN\s*\(([^)]*)\)', 'gi') LOOP
      FOR valeur IN SELECT replace(x[1], '''''', '''')
                    FROM regexp_matches(_m[1], '''((?:[^'']|'''')*)''', 'g') x LOOP
        IF NOT (valeur = ANY(_labels)) THEN
          fonction := _f.fn;
          probleme := 'Liste IN contenant une valeur qui n''existe dans aucun ENUM';
          RETURN NEXT;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_enum_literals() FROM public, anon, authenticated;
