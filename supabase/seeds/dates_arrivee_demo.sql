-- Dates d'entrée fictives étalonnées sur plusieurs années (à exécuter dans le SQL Editor).
-- Ne touche que les personnes fictives (@exemple.test). Rejouable : le résultat est toujours le même.
--  - managers : entrés entre 2016 et 2021
--  - collaborateurs : entrés entre 2018 et aujourd'hui (quelques recrues de moins de 3 mois)
update public.allowed_users u
set created_at = (
  case when r.role = 'manager'
    then date '2021-12-31' - (abs(hashtext(u.email)) % 2100)
    else current_date - (abs(hashtext(u.email)) % 3000)
  end
)::timestamptz
from public.allowed_user_roles r
where r.allowed_user_id = u.id
  and u.email like '%@exemple.test';
