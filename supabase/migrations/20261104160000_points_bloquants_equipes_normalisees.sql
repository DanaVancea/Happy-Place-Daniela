-- Correctif : un manager ne pouvait pas agir sur les points bloquants de son équipe.
-- Les points existants portaient un nom d'équipe en texte libre (ex. « PRODUCT TEAM ») qui ne
-- correspondait à aucune équipe réelle (ex. « Product ») : les droits, qui comparent le nom de
-- l'équipe du point à celle du manager, ne s'appliquaient donc pas.
-- On aligne les anciens noms sur la table teams (rejouable).
UPDATE public.blockers SET department = 'Product'               WHERE upper(btrim(department)) = 'PRODUCT TEAM';
UPDATE public.blockers SET department = 'DSI'                   WHERE upper(btrim(department)) = 'CLOUD & CYBERSÉCURITÉ';
UPDATE public.blockers SET department = 'Pôle Data et IA'       WHERE upper(btrim(department)) = 'DATA & IA';
UPDATE public.blockers SET department = 'Direction recrutement' WHERE upper(btrim(department)) = 'DIRECTION RECRUTEMENT';
UPDATE public.blockers SET department = 'Opérations'            WHERE upper(btrim(department)) IN ('OPÉRATIONS', 'OPERATIONS');
UPDATE public.blockers SET department = 'Relation clients'      WHERE upper(btrim(department)) = 'RELATIONS CLIENTS';
