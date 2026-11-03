-- Données d'exemple pour l'onglet « Gestion des utilisateurs » (à exécuter dans le SQL Editor).
-- Crée trois collaborateurs fictifs : deux avec un départ programmé (dont un cette semaine,
-- ce qui déclenche le bandeau chez les admins) et un sans départ.
-- Pour nettoyer : supprimer ces personnes depuis l'onglet, ou
--   delete from public.allowed_users where email like '%@exemple.test';

with u as (
  insert into public.allowed_users (email, first_name, last_name, team)
  select v.email, v.first_name, v.last_name, (select name from public.teams where not is_reserved order by name limit 1)
  from (values
    ('lea.martin@exemple.test', 'Léa', 'Martin'),
    ('hugo.bernard@exemple.test', 'Hugo', 'Bernard'),
    ('sara.dubois@exemple.test', 'Sara', 'Dubois')
  ) as v(email, first_name, last_name)
  on conflict (email) do nothing
  returning id
)
insert into public.allowed_user_roles (allowed_user_id, role)
select id, 'collaborateur' from u
on conflict (allowed_user_id) do nothing;

update public.allowed_users set departure_date = current_date + 3 where email = 'lea.martin@exemple.test';
update public.allowed_users set departure_date = current_date + 21 where email = 'hugo.bernard@exemple.test';
