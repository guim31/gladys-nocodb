# NocoDB

Vos tables NocoDB dans Gladys : le nombre de lignes d'une table ou d'une vue,
un champ de sa première ligne, un déclencheur de scène quand une ligne est
ajoutée, et des lignes ajoutées ou modifiées depuis vos scènes. NocoDB est une
alternative libre et auto-hébergée à Airtable.

Testé contre un vrai NocoDB 2026.10.2 (Docker, SQLite) : table et vue suivies,
lignes ajoutées et modifiées par les actions de scène, nouvelles lignes
détectées, mauvais jeton, table supprimée, serveur arrêté. Retours et
signalements de bugs bienvenus sur
[GitHub](https://github.com/guim31/gladys-nocodb/issues).

## Ce que vous obtenez

- **Un appareil par table suivie** : son nombre de lignes, ou le nombre de
  lignes d'une de ses vues (ses filtres : « tâches non faites », « tickets
  ouverts »…).
- En option, **un champ de la première ligne de la vue** (son tri : « prochaine
  tâche », « dernier relevé »), en nombre, en oui/non ou en texte.
- Deux **déclencheurs de scène** : « Nouvelle ligne NocoDB » et « Lignes NocoDB
  au-dessus d'un seuil ».
- Deux **actions de scène** : « Ajouter une ligne NocoDB » et « Modifier une
  ligne NocoDB ».
- Un **widget de tableau de bord**, « Tables NocoDB », avec chaque table suivie.

## Prérequis

- NocoDB (une version de 2024 ou plus récente, API v2) joignable depuis Gladys
  par le réseau : pas `localhost`, l'intégration tourne dans son propre
  conteneur. NocoDB Cloud (`https://app.nocodb.com`) fonctionne aussi.
- Un **jeton d'API** : dans NocoDB, Paramètres du compte → Tokens → Créer un
  jeton. Le jeton a les droits de son utilisateur : un utilisateur « Viewer »
  d'une base ne peut pas y écrire (les actions de scène échouent alors en
  disant pourquoi).

## Configuration

- **Adresse** : l'adresse de NocoDB vue depuis Gladys, avec son port, ex.
  `http://192.168.1.20:8080`. Un chemin est conservé
  (`https://example.org/nocodb`).
- **Jeton d'API** : le jeton créé ci-dessus. Il n'est jamais écrit dans les
  journaux.
- **Intervalle de rafraîchissement** : de 30 secondes à 15 minutes (1 minute
  par défaut). Chaque table est lue en deux ou trois requêtes par intervalle.
- **Langue des messages** : les noms des nouvelles fonctionnalités et les
  messages des actions de scène.

« Tester la connexion » liste les tables que voit le jeton (« Base / Table »),
lit les tables suivies et dit ce qui ne va pas.

## Suivre des tables

Utilisez « Suivre une table » dans la configuration de l'intégration :

- **Table** : son nom, `Base / Table` si plusieurs bases ont une table de ce
  nom, ou son identifiant (dans NocoDB : menu de la table → Copier l'identifiant
  de la table).
- **Vue** (facultative) : les lignes comptées sont celles de la vue, avec ses
  filtres. Sans vue, toutes les lignes de la table sont comptées.
- **Champ** (facultatif) : affiche aussi ce champ de la première ligne de la
  vue. Les champs nombre, décimal, monnaie, pourcentage, note, durée, rollup et
  compte donnent un nombre ; une case à cocher donne oui/non ; tout autre champ
  un texte.
- **Seuil** (facultatif) : un nombre de lignes pour le déclencheur « Lignes
  NocoDB au-dessus d'un seuil ».
- **Nom** (facultatif) : le nom de l'appareil.

Ajoutez ensuite l'appareil depuis l'onglet Découverte de l'intégration. La même
table, vue et champ de nouveau changent le nom ou le seuil. « Ne plus suivre une
table » prend les mêmes table, vue et champ ; son appareil reste dans Gladys
jusqu'à sa suppression. 30 tables au plus peuvent être suivies.

## Appareils

- **Lignes** : le nombre de lignes de la table ou de la vue.
- **Le champ suivi**, s'il y en a un, au nom du champ. Un champ texte affiche
  « Aucune ligne » quand la vue est vide.

L'intégration lit NocoDB avec son propre minuteur (Gladys n'interroge pas ces
appareils) et n'envoie une valeur que lorsqu'elle change.

## Scènes

### Déclencheurs

- **Nouvelle ligne NocoDB** : une ligne ajoutée à une table suivie (à sa vue,
  si une vue a été choisie : une ligne qui ne passe pas ses filtres n'est pas
  nouvelle pour elle). Variables : la table, l'identifiant de la ligne, sa
  valeur affichée, et la ligne entière en JSON. Les lignes ajoutées par les
  actions de scène de cette intégration ne le déclenchent pas (pas de boucle).
  Les lignes présentes quand la table est suivie ne sont pas nouvelles. Demande
  une table à identifiant numérique, ce qu'ont toutes les tables créées dans
  NocoDB.
- **Lignes NocoDB au-dessus d'un seuil** : le nombre de lignes dépasse le seuil
  réglé avec « Suivre une table ». Il se déclenche une fois par franchissement :
  le compte doit redescendre au seuil ou en dessous avant de le déclencher à
  nouveau. Variables : la table, le nombre de lignes, le seuil.

Le filtre de table des deux déclencheurs est facultatif : vide, toutes les
tables.

### Actions

- **Ajouter une ligne NocoDB** : ajoute une ligne à une table suivie. Son
  identifiant est une sortie pour les actions suivantes.
- **Modifier une ligne NocoDB** : change des champs d'une ligne d'une table
  suivie, par son identifiant (ex. la variable identifiant de « Nouvelle ligne
  NocoDB »).

Les valeurs s'écrivent `Champ=valeur; Autre=valeur` (séparées par `;` ou des
retours à la ligne), ou en JSON : `{"Champ": "valeur", "Montant": 3}`. Les
variables de scène s'utilisent dans les deux. Une case à cocher accepte
`true`/`false`, `oui`/`non`, `1`/`0` ; un nombre accepte la virgule. Un champ
que la table n'a pas, ou que NocoDB remplit lui-même (identifiant, date de
création, formule…), est refusé avec son nom : NocoDB l'ignorerait sans rien
dire. Une valeur que NocoDB refuse (un texte dans un champ nombre) échoue avec
son message.

## Tableau de bord

Le widget « Tables NocoDB » affiche une ligne par table suivie : son nombre de
lignes, ou le champ suivi. Les tables affichées se choisissent (seulement les
appareils ajoutés à Gladys), et son bouton « Actualiser », qui relit toutes les
tables aussitôt, peut être masqué.

## Limites

- Seules les tables suivies sont lues, jamais une base entière.
- Un champ nombre ou oui/non suivi garde sa dernière valeur quand la vue se
  vide ou que la cellule est vidée (Gladys n'a pas d'état « sans valeur »).
- Une redirection n'est suivie que vers le même hôte (http vers https) : écrivez
  l'adresse finale, ex. `https://app.nocodb.com`.
- Une nouvelle ligne est une ligne dont l'identifiant dépasse le dernier vu :
  une table d'une base externe dont la clé est un texte ne déclenche pas
  « Nouvelle ligne NocoDB ».
- 10 nouvelles lignes au plus par table sont annoncées par lecture ; les
  suivantes à la lecture d'après.
- NocoDB Cloud limite l'API à 5 requêtes par seconde et par utilisateur : les
  tables sont lues l'une après l'autre, et une lecture est sautée tant que la
  précédente tourne. Avec beaucoup de tables, choisissez un intervalle plus long.
- API v2 de NocoDB seulement : les très anciennes versions (avant 2024) ne sont
  pas prises en charge.

## Dépannage

- **« NocoDB refuse le jeton d'API »** : le jeton a été révoqué, ou son
  utilisateur a perdu l'accès à la base. Créez-en un nouveau.
- **« NocoDB est injoignable »** : vérifiez l'adresse depuis la machine qui fait
  tourner Gladys (pas `localhost`), et le port (8080 par défaut).
- **« NocoDB a répondu par une erreur serveur (5xx) »** : NocoDB, ou le proxy
  devant lui, a un problème : voyez ses journaux. L'intégration relit à
  l'intervalle suivant.
- **« Cette adresse ne répond pas comme NocoDB »** : l'adresse mène à un autre
  serveur web, ou il manque le chemin d'un proxy inverse.
- **Une table affiche « Erreur » dans le widget** : elle a été supprimée, ou sa
  vue l'a été ; « Tester la connexion » la nomme. Suivez-la de nouveau.
- Journaux détaillés : `LOG_LEVEL=debug` sur le conteneur.
