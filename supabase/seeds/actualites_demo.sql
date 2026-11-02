-- Articles de démonstration pour la page Actualités (7 articles fictifs de Bigger Boat).
-- À exécuter une seule fois ; les articles déjà présents (même titre) sont ignorés.
INSERT INTO public.news (title, author, department, level, pinned, status, created_at, summary, body)
SELECT v.title, v.author, v.department, v.level, v.pinned, 'publiée'::news_status, v.created_at, v.summary, v.body
FROM (VALUES
('Les entretiens annuels s’ouvrent le 9 novembre', 'Clara', 'RH', 'important', true, '2026-10-30 09:00+00'::timestamptz, 'La campagne d’entretiens annuels démarre lundi 9 novembre. Chaque manager vous proposera un créneau d’ici vendredi.', 'La campagne d’entretiens annuels de Bigger Boat se déroule du 9 au 27 novembre. C’est le moment de faire le point avec votre manager sur l’année écoulée, de partager ce qui a bien fonctionné et ce qui vous a freiné, et de préparer l’année qui vient. Chaque entretien dure environ une heure et se tient en face à face ou en visio, selon votre préférence.

Avant l’entretien, prenez vingt minutes pour remplir votre auto-évaluation dans l’espace RH. Elle porte sur vos missions, vos compétences et vos souhaits d’évolution. Elle n’est pas notée : elle sert seulement de base à la discussion. Votre manager remplit de son côté sa propre grille, et vous la relisez ensemble pendant l’entretien.

À l’issue de l’entretien, un compte rendu court est rédigé et signé par les deux parties. Il est conservé dans votre dossier RH, auquel vous seul et votre manager avez accès. Les demandes de formation exprimées sont transmises à l’équipe RH, qui revient vers vous avant la fin du mois de décembre.

Si vous n’avez pas reçu de proposition de créneau d’ici vendredi 6 novembre, contactez votre manager ou l’équipe RH. Pour toute question sur la grille d’évaluation, un guide de préparation est disponible dans l’espace RH, avec des exemples de formulations.'),
('Migration de la messagerie, coupure le samedi 14 novembre', 'Thomas', 'DSI', 'urgent', true, '2026-10-29 09:00+00'::timestamptz, 'La messagerie sera indisponible le samedi 14 novembre de 8 h à 14 h. Aucune action n’est requise, mais quelques précautions s’imposent.', 'La DSI migre la messagerie de Bigger Boat vers une nouvelle plateforme plus rapide et mieux protégée. L’opération aura lieu le samedi 14 novembre. Entre 8 h et 14 h, la messagerie et les agendas seront indisponibles. Les autres outils (Happy Place, la visioconférence, le partage de fichiers) restent accessibles.

Vous n’avez rien à installer. Votre adresse, vos dossiers et votre calendrier seront repris automatiquement. En revanche, nous vous conseillons de ne pas planifier de rendez-vous avec des clients ce samedi matin, et de vérifier que vos réunions du lundi 16 novembre apparaissent bien dans votre agenda en arrivant.

Côté téléphone, la messagerie de votre mobile devra être reconnectée le lundi. Une fiche pas à pas, avec des captures d’écran, sera envoyée vendredi 13 novembre. Si vous utilisez une application de messagerie tierce, pensez à vous munir de votre mot de passe habituel.

Une permanence de la DSI sera ouverte le lundi 16 novembre, de 9 h à 12 h, au deuxième étage, pour aider celles et ceux qui rencontrent un problème. En cas d’urgence pendant la coupure, un numéro dédié sera communiqué dans la fiche du vendredi.'),
('De nouveaux espaces de travail au deuxième étage', 'Sophie', 'Office management', 'information', false, '2026-10-28 09:00+00'::timestamptz, 'Le deuxième étage accueille quatre salles de concentration et une zone de travail partagée, réservables dès lundi.', 'À la suite de l’enquête de septembre, où vous étiez nombreux à regretter le manque de calme, les travaux du deuxième étage sont terminés. Vous disposez désormais de quatre petites salles de concentration pour une personne, d’une salle de réunion de huit places équipée pour la visioconférence, et d’une grande zone de travail partagée en libre accès.

Les salles de concentration et la salle de réunion se réservent depuis l’application de planning, jusqu’à quatre heures d’affilée. Pour que chacun en profite, une réservation non confirmée au bout de dix minutes est automatiquement libérée. La zone partagée, elle, ne se réserve pas : premier arrivé, premier installé.

Chaque salle est équipée d’un écran, de prises en nombre suffisant et d’un éclairage réglable. Le mobilier a été choisi pour limiter le bruit, et des panneaux acoustiques ont été posés au plafond. Nous vous demandons de laisser les lieux propres et de remettre les chaises en place en partant.

Votre avis nous intéresse : un court questionnaire sera envoyé dans un mois pour savoir si ces espaces répondent à vos besoins. Pour toute remarque d’ici là, écrivez à l’équipe Office Management, qui ajustera l’aménagement si nécessaire.'),
('Bienvenue aux six nouvelles recrues de novembre', 'Nadia', 'RH', 'information', false, '2026-10-27 09:00+00'::timestamptz, 'Six personnes rejoignent Bigger Boat en novembre dans quatre équipes. Un petit-déjeuner d’accueil leur est offert lundi.', 'Nous avons le plaisir d’accueillir six nouvelles personnes en novembre. Deux rejoignent l’équipe Tech, une l’équipe Produit, deux l’équipe Ventes et une l’équipe Marketing. Elles arrivent avec des parcours variés : certaines viennent de cabinets concurrents, d’autres de l’industrie ou du conseil.

Leur première semaine est organisée par l’équipe RH. Elle comprend une présentation de l’entreprise, la remise du matériel, un tour des locaux et un déjeuner avec leur équipe. Chaque nouvelle recrue est accompagnée par un parrain ou une marraine, volontaire de son équipe, qui reste son premier contact pendant trois mois.

Un petit-déjeuner d’accueil est organisé lundi 2 novembre à 9 h 30 dans la salle commune. Vous êtes toutes et tous invités à venir faire connaissance. Leurs fiches sont déjà disponibles dans le Trombi, avec leur équipe et leur arrivée.

Si vous souhaitez devenir parrain ou marraine pour les prochaines arrivées, signalez-le à l’équipe RH. Le rôle demande environ une heure par semaine pendant le premier mois, et une formation courte est proposée.'),
('Sécurité : activez la double authentification avant le 30 novembre', 'Karim', 'DSI', 'important', false, '2026-10-22 09:00+00'::timestamptz, 'La double authentification devient obligatoire le 30 novembre. L’activation prend moins de cinq minutes.', 'Pour protéger les données de nos clients et de nos candidats, la double authentification devient obligatoire pour tous les comptes Bigger Boat le 30 novembre. Elle ajoute une seconde vérification à votre mot de passe, par exemple un code sur votre téléphone, et bloque la grande majorité des tentatives d’intrusion.

L’activation prend moins de cinq minutes. Rendez-vous dans les paramètres de votre compte, section Sécurité, choisissez l’application d’authentification de votre choix et suivez les étapes. Pensez à noter vos codes de secours dans un endroit sûr : ils vous permettront de vous reconnecter si vous perdez votre téléphone.

À ce jour, un peu plus de la moitié des collaborateurs l’ont déjà activée. Les équipes Tech et Produit sont en tête. Un point d’avancement sera publié chaque semaine ici même.

Si vous rencontrez une difficulté, la DSI tient une permanence tous les jeudis de 14 h à 16 h au deuxième étage. Après le 30 novembre, un compte sans double authentification sera temporairement bloqué, et il faudra passer par la DSI pour le réactiver. Mieux vaut donc s’y prendre dès maintenant.'),
('Télétravail : des jours flexibles à partir de janvier', 'Clara', 'RH', 'important', false, '2026-10-20 09:00+00'::timestamptz, 'À partir de janvier, deux jours de télétravail par semaine restent fixes et un troisième devient flexible.', 'À la suite de la consultation menée en septembre, le télétravail évolue à partir du 4 janvier. Les deux jours de présence communs à chaque équipe restent inchangés. En plus, un jour de télétravail devient flexible : vous le choisissez chaque semaine, après accord de votre manager, selon vos besoins et ceux de l’équipe.

Ce changement répond à une demande exprimée par une majorité d’entre vous. Il s’accompagne de deux règles simples. D’abord, les jours de présence communs sont maintenus pour garder des temps de travail ensemble. Ensuite, la planification se fait dans l’outil de planning, au plus tard le jeudi pour la semaine suivante.

Le règlement mis à jour est disponible dans l’espace RH. Il précise les situations particulières : période d’intégration, déplacements chez les clients, impossibilité temporaire de télétravailler. Pour les nouvelles recrues, les trois premiers mois se font en présence, avec une souplesse accordée par le manager.

Une réunion d’information ouverte à toutes et à tous aura lieu le mardi 17 novembre à 12 h 30 en salle Lumière. Les questions peuvent être envoyées à l’avance à l’équipe RH, qui y répondra pendant la réunion.'),
('Afterwork d’automne et collecte solidaire', 'Julien', 'Office management', 'information', false, '2026-10-15 09:00+00'::timestamptz, 'Rendez-vous jeudi 12 novembre à 18 h pour l’afterwork d’automne. Apportez un vêtement chaud pour la collecte.', 'L’afterwork de l’automne aura lieu le jeudi 12 novembre à partir de 18 h dans la salle commune du premier étage. Au programme : un buffet, un quiz par équipes et des jeux de société. Les inscriptions sont ouvertes jusqu’au vendredi 6 novembre, et les places sont limitées à quatre-vingts personnes.

Cette année, la soirée est associée à une collecte solidaire au profit d’une association locale. Nous vous invitons à apporter un manteau, une écharpe ou des gants en bon état. Une caisse sera disposée à l’accueil dès lundi 9 novembre, et l’association viendra la récupérer le vendredi.

Pour le buffet, merci de nous indiquer vos restrictions alimentaires lors de l’inscription. Des options végétariennes et sans gluten sont prévues. Les boissons sans alcool seront proposées en plus des boissons habituelles.

Le quiz se joue par équipes de quatre, constituées sur place pour favoriser les rencontres entre services. Les gagnants repartent avec une carte cadeau pour un déjeuner d’équipe. L’équipe Office Management vous attend nombreux, et cherche deux volontaires pour aider à l’accueil.')
) AS v(title, author, department, level, pinned, created_at, summary, body)
WHERE NOT EXISTS (SELECT 1 FROM public.news n WHERE n.title = v.title);
