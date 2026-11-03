-- Équipes et personnes fictives pour Happy Place (à exécuter dans le SQL Editor de Supabase).
--
-- 1. Ajoute les équipes qui manquent (sans doublon, sans tenir compte des majuscules).
--    Finance, Produit, Pôle Data et IA, Legal existaient déjà. « Equipe commerciale » et
--    « Sales » sont couverts par « Direction Commerciale » et « Ventes » (« Sales » avait été
--    fusionné dans « Direction Commerciale » lors de la création du référentiel des équipes).
-- 2. Crée, dans chaque équipe présente dans la base, 1 manager et 3 collaborateurs fictifs.
--    Adresses en @exemple.test : aucun e-mail n'est envoyé, personne ne peut se connecter avec.
-- Rejouable sans risque : une personne déjà présente n'est pas modifiée.
-- Pour supprimer ces données : delete from public.allowed_users where email like '%@exemple.test';

insert into public.teams (name)
select v.name from (values ('Office management'), ('DSI')) as v(name)
where not exists (select 1 from public.teams t where lower(t.name) = lower(v.name));

with demo(email, first_name, last_name, team, role) as (
  values
    ('claire.lemoine@exemple.test', 'Claire', 'Lemoine', 'Accounting', 'manager'),
    ('thomas.girard@exemple.test', 'Thomas', 'Girard', 'Accounting', 'collaborateur'),
    ('nadia.benali@exemple.test', 'Nadia', 'Benali', 'Accounting', 'collaborateur'),
    ('paul.rousseau@exemple.test', 'Paul', 'Rousseau', 'Accounting', 'collaborateur'),
    ('isabelle.fontaine@exemple.test', 'Isabelle', 'Fontaine', 'Finance', 'manager'),
    ('karim.haddad@exemple.test', 'Karim', 'Haddad', 'Finance', 'collaborateur'),
    ('julie.mercier@exemple.test', 'Julie', 'Mercier', 'Finance', 'collaborateur'),
    ('antoine.roche@exemple.test', 'Antoine', 'Roche', 'Finance', 'collaborateur'),
    ('sophie.marchand@exemple.test', 'Sophie', 'Marchand', 'Legal', 'manager'),
    ('hugo.lambert@exemple.test', 'Hugo', 'Lambert', 'Legal', 'collaborateur'),
    ('ines.colin@exemple.test', 'Inès', 'Colin', 'Legal', 'collaborateur'),
    ('romain.vidal@exemple.test', 'Romain', 'Vidal', 'Legal', 'collaborateur'),
    ('camille.dupuis@exemple.test', 'Camille', 'Dupuis', 'Marketing', 'manager'),
    ('leo.garnier@exemple.test', 'Léo', 'Garnier', 'Marketing', 'collaborateur'),
    ('manon.perrin@exemple.test', 'Manon', 'Perrin', 'Marketing', 'collaborateur'),
    ('yanis.boucher@exemple.test', 'Yanis', 'Boucher', 'Marketing', 'collaborateur'),
    ('elodie.chevalier@exemple.test', 'Élodie', 'Chevalier', 'People', 'manager'),
    ('mehdi.bouzid@exemple.test', 'Mehdi', 'Bouzid', 'People', 'collaborateur'),
    ('laura.faure@exemple.test', 'Laura', 'Faure', 'People', 'collaborateur'),
    ('nicolas.andre@exemple.test', 'Nicolas', 'Andre', 'People', 'collaborateur'),
    ('julien.morel@exemple.test', 'Julien', 'Morel', 'Product', 'manager'),
    ('sarah.lopez@exemple.test', 'Sarah', 'Lopez', 'Product', 'collaborateur'),
    ('maxime.blanc@exemple.test', 'Maxime', 'Blanc', 'Product', 'collaborateur'),
    ('amelie.guerin@exemple.test', 'Amélie', 'Guerin', 'Product', 'collaborateur'),
    ('vincent.renard@exemple.test', 'Vincent', 'Renard', 'Direction Commerciale', 'manager'),
    ('aicha.diallo@exemple.test', 'Aïcha', 'Diallo', 'Direction Commerciale', 'collaborateur'),
    ('baptiste.clement@exemple.test', 'Baptiste', 'Clement', 'Direction Commerciale', 'collaborateur'),
    ('lucie.roux@exemple.test', 'Lucie', 'Roux', 'Direction Commerciale', 'collaborateur'),
    ('stephane.picard@exemple.test', 'Stéphane', 'Picard', 'Opérations', 'manager'),
    ('fatima.zahra@exemple.test', 'Fatima', 'Zahra', 'Opérations', 'collaborateur'),
    ('damien.leroy@exemple.test', 'Damien', 'Leroy', 'Opérations', 'collaborateur'),
    ('oceane.petit@exemple.test', 'Océane', 'Petit', 'Opérations', 'collaborateur'),
    ('melanie.barbier@exemple.test', 'Mélanie', 'Barbier', 'Relation clients', 'manager'),
    ('samuel.cohen@exemple.test', 'Samuel', 'Cohen', 'Relation clients', 'collaborateur'),
    ('charlotte.noel@exemple.test', 'Charlotte', 'Noel', 'Relation clients', 'collaborateur'),
    ('adrien.meyer@exemple.test', 'Adrien', 'Meyer', 'Relation clients', 'collaborateur'),
    ('frederic.lacroix@exemple.test', 'Frédéric', 'Lacroix', 'Direction Conseil', 'manager'),
    ('justine.moreau@exemple.test', 'Justine', 'Moreau', 'Direction Conseil', 'collaborateur'),
    ('omar.sylla@exemple.test', 'Omar', 'Sylla', 'Direction Conseil', 'collaborateur'),
    ('elsa.duval@exemple.test', 'Elsa', 'Duval', 'Direction Conseil', 'collaborateur'),
    ('delphine.aubert@exemple.test', 'Delphine', 'Aubert', 'Pôle Data et IA', 'manager'),
    ('mathis.brunet@exemple.test', 'Mathis', 'Brunet', 'Pôle Data et IA', 'collaborateur'),
    ('priya.nair@exemple.test', 'Priya', 'Nair', 'Pôle Data et IA', 'collaborateur'),
    ('clement.gauthier@exemple.test', 'Clément', 'Gauthier', 'Pôle Data et IA', 'collaborateur'),
    ('beatrice.carpentier@exemple.test', 'Béatrice', 'Carpentier', 'Direction recrutement', 'manager'),
    ('idriss.camara@exemple.test', 'Idriss', 'Camara', 'Direction recrutement', 'collaborateur'),
    ('anais.renaud@exemple.test', 'Anaïs', 'Renaud', 'Direction recrutement', 'collaborateur'),
    ('tom.schmitt@exemple.test', 'Tom', 'Schmitt', 'Direction recrutement', 'collaborateur'),
    ('nathalie.poirier@exemple.test', 'Nathalie', 'Poirier', 'Office management', 'manager'),
    ('louis.lefebvre@exemple.test', 'Louis', 'Lefebvre', 'Office management', 'collaborateur'),
    ('zoe.martinez@exemple.test', 'Zoé', 'Martinez', 'Office management', 'collaborateur'),
    ('kevin.da-silva@exemple.test', 'Kevin', 'Da Silva', 'Office management', 'collaborateur'),
    ('olivier.besson@exemple.test', 'Olivier', 'Besson', 'DSI', 'manager'),
    ('chloe.hamon@exemple.test', 'Chloé', 'Hamon', 'DSI', 'collaborateur'),
    ('rayan.messaoudi@exemple.test', 'Rayan', 'Messaoudi', 'DSI', 'collaborateur'),
    ('elisa.fabre@exemple.test', 'Elisa', 'Fabre', 'DSI', 'collaborateur'),
    ('gabrielle.marin@exemple.test', 'Gabrielle', 'Marin', 'Produit', 'manager'),
    ('theo.navarro@exemple.test', 'Théo', 'Navarro', 'Produit', 'collaborateur'),
    ('jade.lemaire@exemple.test', 'Jade', 'Lemaire', 'Produit', 'collaborateur'),
    ('alexis.perret@exemple.test', 'Alexis', 'Perret', 'Produit', 'collaborateur'),
    ('raphael.joly@exemple.test', 'Raphaël', 'Joly', 'Ventes', 'manager'),
    ('maelle.bertrand@exemple.test', 'Maëlle', 'Bertrand', 'Ventes', 'collaborateur'),
    ('sofiane.kaci@exemple.test', 'Sofiane', 'Kaci', 'Ventes', 'collaborateur'),
    ('margaux.leclerc@exemple.test', 'Margaux', 'Leclerc', 'Ventes', 'collaborateur'),
    ('valerie.hubert@exemple.test', 'Valérie', 'Hubert', 'Communication', 'manager'),
    ('enzo.carlier@exemple.test', 'Enzo', 'Carlier', 'Communication', 'collaborateur'),
    ('lina.brun@exemple.test', 'Lina', 'Brun', 'Communication', 'collaborateur'),
    ('arthur.weber@exemple.test', 'Arthur', 'Weber', 'Communication', 'collaborateur'),
    ('sebastien.gilles@exemple.test', 'Sébastien', 'Gilles', 'IT', 'manager'),
    ('noemie.rey@exemple.test', 'Noémie', 'Rey', 'IT', 'collaborateur'),
    ('bilal.merabet@exemple.test', 'Bilal', 'Merabet', 'IT', 'collaborateur'),
    ('eva.colas@exemple.test', 'Eva', 'Colas', 'IT', 'collaborateur'),
    ('patrick.gomez@exemple.test', 'Patrick', 'Gomez', 'Logistique', 'manager'),
    ('clara.huet@exemple.test', 'Clara', 'Huet', 'Logistique', 'collaborateur'),
    ('moussa.traore@exemple.test', 'Moussa', 'Traore', 'Logistique', 'collaborateur'),
    ('alice.maillard@exemple.test', 'Alice', 'Maillard', 'Logistique', 'collaborateur'),
    ('corinne.pasquier@exemple.test', 'Corinne', 'Pasquier', 'Support', 'manager'),
    ('dylan.poulain@exemple.test', 'Dylan', 'Poulain', 'Support', 'collaborateur'),
    ('salome.ferrand@exemple.test', 'Salomé', 'Ferrand', 'Support', 'collaborateur'),
    ('axel.tessier@exemple.test', 'Axel', 'Tessier', 'Support', 'collaborateur')
),
ins as (
  insert into public.allowed_users (email, first_name, last_name, team)
  select d.email, d.first_name, d.last_name, case when d.role = 'collaborateur' then d.team end
  from demo d
  -- uniquement dans les équipes présentes dans la base
  where exists (select 1 from public.teams t where t.name = d.team)
  on conflict (email) do nothing
  returning id, email
),
roles as (
  insert into public.allowed_user_roles (allowed_user_id, role)
  select i.id, d.role::public.app_role
  from ins i join demo d on d.email = i.email
  on conflict (allowed_user_id) do update set role = excluded.role
  returning allowed_user_id
)
insert into public.manager_teams (allowed_user_id, team)
select i.id, d.team
from ins i join demo d on d.email = i.email
where d.role = 'manager'
on conflict do nothing;
