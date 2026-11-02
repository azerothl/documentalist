# Documentalist

Plateforme de documentation avec espaces, pages imbriquées, édition par blocs et portails publiés. Application Next.js 16 / React 19 / TipTap, avec comptes locaux et stockage SQLite chiffré.

## Démarrer

Node.js 22 est recommandé.

```sh
npm install
npm run dev
```

Ouvrir [le compte initial](http://localhost:3000/setup). Le code d’installation est généré dans `data/setup-token` (ou fourni par `DOCUMENTALIST_SETUP_TOKEN`). Il autorise la création du premier administrateur. Aucun compte ni mot de passe par défaut n’est créé.

- `/login` : connexion, session de 8 heures ;
- `/app` : rédaction et consultation ;
- `/team` : comptes, rôles, activité et sauvegardes ;
- `/p/{slug}` : portail publié, avec les onglets Learn, Reference et Blog (`/p/{slug}/learn/…`, `/p/{slug}/reference/…`, `/p/{slug}/blog/…`), et le choix de version et de langue. Les anciens liens sans onglet ouvrent toujours la page dans Reference.

Pour les réglages d’hébergement, partir de [.env.example](.env.example). `DOCUMENTALIST_URL` doit correspondre à l’URL réellement ouverte par les utilisateurs. En production, utiliser HTTPS ; pour un serveur de production **local sur HTTP**, définir explicitement `DOCUMENTALIST_COOKIE_SECURE=false`.

Les invitations de comptes et les liens magiques nécessitent un relais SMTP. Définir `DOCUMENTALIST_SMTP_URL` et `DOCUMENTALIST_EMAIL_FROM` dans l’environnement du serveur (par exemple dans `/etc/documentalist/production.env` sur la Dedibox). Utiliser `smtps://...:465` ou `smtp://...:587` ; encoder les caractères réservés du nom d’utilisateur et du mot de passe dans l’URL. Les invitations de compte expirent après 24 heures, les liens magiques après 24 heures et les sessions de lecture après 8 heures. OIDC/SSO n’est pas encore inclus.

```sh
npm run build
npm start
```

## Déployer sur la Dedibox

Documentalist peut partager le serveur d’Agent Arena. L’application tourne dans son propre conteneur, écoute uniquement sur `127.0.0.1:3035` et conserve ses données dans `/data/documentalist`. Caddy termine HTTPS pour `documentalist.akasha-labs.com`; son bloc est ajouté à la configuration existante sans remplacer celui d’Agent Arena.

Avant l’installation, faire pointer l’enregistrement DNS A `documentalist.akasha-labs.com` vers `62.210.65.167`. Le serveur doit déjà avoir Docker Compose, Caddy, le compte `azerothl` et le compte de déploiement `agent-deploy` utilisés par Agent Arena.

### Préparer l’accès GitHub en lecture seule

Sur le serveur, sous `azerothl`, créer une clé distincte qui permet uniquement de lire le dépôt privé :

```sh
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C documentalist-dedibox-readonly -f ~/.ssh/documentalist-readonly -N ''
```

Ajouter le contenu de `~/.ssh/documentalist-readonly.pub` dans GitHub → Documentalist → Settings → Deploy keys, sans cocher l’accès en écriture. Le fichier `/home/azerothl/.ssh/github_known_hosts` doit déjà contenir la clé d’hôte GitHub vérifiée, comme pour Agent Arena.

Cloner le dépôt et configurer sa clé :

```sh
GIT_SSH_COMMAND='ssh -i /home/azerothl/.ssh/documentalist-readonly -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/azerothl/.ssh/github_known_hosts' \
  git clone git@github.com:azerothl/documentalist.git /home/azerothl/documentalist
git -C /home/azerothl/documentalist config core.sshCommand \
  'ssh -i /home/azerothl/.ssh/documentalist-readonly -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/azerothl/.ssh/github_known_hosts'
```

Depuis le clone, lancer une fois le bootstrap :

```sh
cd /home/azerothl/documentalist
sudo bash scripts/bootstrap-production-server.sh
```

Le bootstrap ajoute un bloc Caddy, prépare `/etc/documentalist/production.env` et `/data/documentalist`, installe une commande distante SSH limitée au déploiement de Documentalist, puis démarre l’application. Il préserve le bloc Caddy d’Agent Arena. Les données et la clé de chiffrement restent sur le volume hôte et ne sont pas remplacées lors des mises à jour.

Le code d’installation du premier compte administrateur est créé dans `/data/documentalist/setup-token`. Ouvrir `https://documentalist.akasha-labs.com/setup` et utiliser ce code. Le retirer après la création du compte. Conserver des sauvegardes de `/data/documentalist`, notamment de `encryption.key` avec la base SQLite.

### Mises à jour automatiques

Le workflow `.github/workflows/deploy-production.yml` se déclenche après chaque push sur `main`. Il se connecte à la Dedibox avec une clé Actions dédiée, puis le serveur récupère `main`, reconstruit l’image et remplace le conteneur après une compilation réussie.

Le workflow reste inactif tant que la variable Actions `DOCUMENTALIST_DEPLOY_ENABLED` n’est pas égale à `true`. Une fois le bootstrap terminé, définir cette variable à `true` et lancer le workflow manuellement pour le premier déploiement ; les pushes suivants sur `main` déploient automatiquement.

Le dépôt utilise ces secrets Actions : `DOCUMENTALIST_DEPLOY_HOST`, `DOCUMENTALIST_DEPLOY_USER`, `DOCUMENTALIST_DEPLOY_SSH_PRIVATE_KEY` et `DOCUMENTALIST_DEPLOY_SSH_KNOWN_HOSTS`. Le bootstrap installe la clé publique correspondante dans le compte `agent-deploy`; la clé privée doit rester dans le secret GitHub. La valeur de `DOCUMENTALIST_DEPLOY_SSH_KNOWN_HOSTS` doit contenir la clé SSH de la Dedibox vérifiée, avec l’adresse IP utilisée par `DOCUMENTALIST_DEPLOY_HOST`.

La compilation utilise webpack et un correctif ciblé pour les volumes Windows qui renvoient une erreur incorrecte pour `readlink`. Le correctif est inactif sur les autres systèmes.

## Fonctions disponibles

| Fonction                | Comportement                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Espaces et arborescence | Pages, catégories, liens, glisser-déposer, détection des cycles et des slugs en double                                                                                                                                            |
| Édition                 | Blocs `/`, tableaux, tâches, images par URL, encadrés, coloration du code et aperçu                                                                                                                                               |
| Sauvegarde              | File de sauvegarde par document, attente avant publication, alerte si la page est quittée avant enregistrement, révisions restaurables                                                                                            |
| Publication             | Instantané des documents et variables, pages masquées exclues côté serveur ; choix public, code partagé ou lien magique nominatif ; retrait possible du portail public                                                              |
| Portail                 | Onglets Learn, Reference et Blog, interface française ou anglaise selon la langue sélectionnée (repli français), dates localisées, lecture sans TipTap, sommaire, recherche (Ctrl K), menu mobile et versions                         |
| Accès                   | Administrateur, rédacteur et lecteur ; invitations d’équipe par courriel ; portails publics, par code ou réservés aux adresses invitées ; vérification côté serveur et cookies HttpOnly                                            |
| IA                      | Question, rédaction et correction sur le contexte de la page avec OpenAI, Anthropic ou une API compatible                                                                                                                         |
| Import/export           | Markdown ; adaptation GFM, Obsidian et MDX sans exécuter de JavaScript                                                                                                                                                            |
| GitHub                  | Import d’un arbre Markdown/MDX par onglet : dossier docs → Reference, dossier Learn, dossier Blog (notes de version datées). Ordre SUMMARY → liens README → frontmatter → préfixe, sync manuelle ou automatique, token facultatif |
| GitLab                  | Import d’un arbre Markdown/MDX dans un nouvel espace, sync manuelle ou automatique, hôte et token configurables                                                                                                                   |
| Notion                  | Import de la page partagée et sous-pages, sync manuelle ou automatique ; blocs non convertis signalés                                                                                                                             |
| OpenAPI                 | JSON ou YAML : paramètres, corps de requête, réponses, schémas locaux et sécurité                                                                                                                                                 |
| Notifications           | Slack, Discord et webhook de publication ; succès et échecs consignés dans l’activité                                                                                                                                             |

Les intégrations sont accessibles aux administrateurs dans Outils → Intégrations. Enregistrer la connexion avant l’import GitLab/Notion. Les imports GitHub, GitLab et Notion lient une source à l’espace : Relancer sync depuis l’en-tête, ou synchronisation automatique à l’ouverture / selon l’intervalle choisi (upsert par chemin source). L’ordre des pages suit `SUMMARY.md` s’il est présent, sinon les liens depuis `README.md` / `index.md`, puis le frontmatter (`sidebar_position`, `nav_order`, …), les préfixes numériques (`01-…`) et un tri naturel. OpenAPI et les fichiers Markdown locaux restent des copies ponctuelles. Limites : 500 fichiers Markdown pour GitHub (zipball, repli blobs), 80 fichiers/pages pour GitLab et Notion, 2 000 blocs Notion, 200 opérations OpenAPI. Les références OpenAPI externes ne sont pas téléchargées. Les images Notion hébergées par Notion peuvent expirer ; elles ne sont pas copiées dans un stockage média.

Dans un espace lié à GitHub, les pages et catégories qui proviennent des dossiers importés sont en lecture seule dans l’espace de rédaction. Modifiez-les dans le dépôt, puis relancez la synchronisation. Les pages créées directement dans Documentalist restent modifiables et sont rangées après les pages importées. Détacher la source arrête la synchronisation et permet d’éditer l’espace comme une copie locale.

Les lecteurs disposent d’une vue en lecture seule, y compris pour les documents non publiés. Les rédacteurs peuvent modifier et publier tous les espaces. Les administrateurs gèrent aussi les secrets, les accès et les comptes. Les droits sont vérifiés par le serveur, sans dépendre des boutons de l’interface. Les commentaires utilisent le nom du compte connecté.

## Onglets Learn, Reference et Blog

Le portail reprend la structure de react.dev : une barre du haut avec la recherche et les onglets, la navigation de l’onglet à gauche, la page au centre et « Sur cette page » à droite.

- **Reference** : documentation de référence. Les documents créés avant les onglets y restent.
- **Learn** : guides, tutoriels et parcours e-learning.
- **Blog** : notes de version. L’accueil du blog liste les articles du plus récent au plus ancien ; chaque article affiche sa date de publication.

Dans « Importer depuis GitHub », le champ « Dossier docs » alimente Reference. Les champs facultatifs « Dossier Learn » et « Dossier Blog » alimentent les deux autres onglets ; une bulle d’aide (ⓘ) explique chaque champ. Les trois dossiers doivent être différents ; si l’un est inclus dans un autre (`docs` et `docs/learn`), chaque fichier va dans le dossier le plus précis. Les notes de version forment une liste à plat, datée par le champ `date` du frontmatter ou par une date dans le chemin (`2026/10/01/…` ou `2026-10-01-…`). Un `index.md` ou `README.md` sans date à la racine du blog sert d’introduction.

Dans l’espace de rédaction, les onglets filtrent l’arborescence ; une page créée va dans l’onglet ouvert, une sous-page suit l’onglet de son parent. « Plus → Déplacer vers l’onglet … » change l’onglet d’une page et de ses sous-pages. Les articles du blog ont un champ « Date de publication ».

## Apparence, lecture et navigation

« Apparence et lecture » est accessible à tous les rôles depuis le compte et depuis les portails. Trois thèmes sont proposés : Clair, Sombre — Nuit et Contraste renforcé, aux couleurs de la charte FASST (bleu #1F425B, accent ocre #C76A55, titres en Barlow, texte en DM Sans). Le mode Système suit automatiquement le réglage de l’appareil. Le texte peut être affiché à 16, 18 ou 20 px, avec une largeur confortable ou large. Le mode lecture masque les outils de rédaction ; « Revenir à la rédaction » permet de les retrouver. Les préférences sont conservées dans le navigateur, indépendamment des réglages de l’espace.

Sur mobile, « Documents » ouvre la navigation et la recherche ; « Panneau de page » donne accès au sommaire, aux commentaires, au SEO et à l’IA. Les fenêtres se ferment avec Échap et conservent le focus au clavier. « Plus → Déplacer… » permet de classer les pages sans glisser-déposer. Les liens de l’espace de rédaction conservent l’espace, la langue et le document ; la vue Lecteur utilise la même navigation documentaire que le portail, en conservant ses droits de consultation interne.

Sur ordinateur, le nom de l’application, les sélecteurs et le compte partagent la même ligne. La barre se replie sur les petits écrans. Le titre de la fenêtre suit la page active ; les tâches publiées exposent leur libellé et leur état coché avec des cases natives en lecture seule.

Les couleurs personnalisées d’un espace sont ajustées à l’affichage pour maintenir un contraste lisible dans chaque thème. Les encadrés publiés conservent leurs intitulés Information, Attention et Succès. Les contrôles automatisés du navigateur couvrent notamment les thèmes avec axe, les dialogues au clavier, le repli à 320 px et la navigation en lecture seule. Ils ne remplacent pas une qualification complète avec des lecteurs d’écran et des appareils réels.

Un parcours ciblé a également été vérifié le 1er novembre 2026 avec NVDA 2026.3 et Microsoft Edge sous Windows : 21 étapes couvrant l’éditeur, les préférences, le focus, la recherche, les onglets, les commentaires et la lecture du portail. Les libellés des tâches ont été associés par des éléments `label` natifs pour éviter leur répétition en lecture continue ; les liens de page précédente et suivante disposent d’un nom explicite. Le menu documentaire a aussi été vérifié avec une fenêtre de 390 px de large sur ordinateur.

## Données et sauvegardes

Au premier accès, l’ancien `data/store.json` est migré sans réinitialisation silencieuse : son contenu est conservé dans `legacy-backup.enc`, puis le fichier en clair est retiré. Un fichier invalide provoque une erreur explicite.

- `documentalist.sqlite` : état chiffré AES-256-GCM, comptes, sessions et activité ;
- `encryption.key` : clé locale si aucune clé externe n’est configurée ;
- `legacy-backup.enc` : sauvegarde chiffrée des anciennes données ;
- les 20 états précédents sont conservés dans SQLite et restaurables depuis `/team` ;
- le journal conserve les 5 000 dernières actions ; les mots de passe utilisent scrypt.

Une transaction protège les écritures et une révision empêche les mises à jour concurrentes de s’écraser. Un conflit renvoie une erreur 409 ; recharger avant de réessayer. SQLite doit rester sur un disque local persistant : cette version ne prend pas en charge plusieurs serveurs avec des copies indépendantes de la base, ni la coédition simultanée d’un même texte. L’état documentaire reste une unité JSON chiffrée dans SQLite ; une base relationnelle indexée devient utile pour de grands corpus.

Depuis `/team`, un administrateur peut télécharger une sauvegarde complète. Pour produire aussi un fichier sur le serveur :

```sh
npm run data:backup
```

Conserver les sauvegardes **et la clé** séparément avec des droits d’accès adaptés. Pour une restauration complète, arrêter le serveur, sauvegarder les fichiers actuels, remplacer `documentalist.sqlite` par la sauvegarde, retirer ses anciens fichiers `-wal` et `-shm`, puis redémarrer avec la même clé. La restauration d’un état depuis l’interface conserve les comptes et le journal.

Les secrets enregistrés ne sont pas renvoyés en clair au navigateur. Le masque `••••••••` signifie « conserver la valeur » ; remplacer le champ pour changer le secret, ou le vider pour le supprimer. Une nouvelle clé MCP est affichée une seule fois à sa création, puis seule son empreinte est conservée. Le CSS libre a été retiré ; la couleur d’accent reste configurable.

Les requêtes sortantes vérifient les adresses DNS au moment de la connexion, refusent les réseaux privés par défaut, les protocoles dangereux et les redirections ; elles limitent aussi le temps et la taille des réponses. Les exceptions réseau sont configurées uniquement par l’opérateur dans `DOCUMENTALIST_PRIVATE_HOSTS`.

## Accès documentaire des agents avec MCP

Le serveur MCP est disponible à l’adresse `https://votre-domaine/mcp`, sur la même application et le même serveur. Il utilise Streamable HTTP en mode sans session et répond en JSON. Aucun service ou modèle d’IA supplémentaire n’est nécessaire. Les clients doivent prendre en charge ce transport ; le transport SSE historique n’est pas proposé.

Sans authentification, les agents peuvent lire uniquement les espaces publiés en mode public. Pour autoriser une documentation privée, ouvrez **Équipe et activité → Accès des agents (MCP)** en tant qu’administrateur. Choisissez un compte actif, les espaces autorisés et la durée de validité de la clé. Copiez la configuration affichée une seule fois dans votre client MCP :

```json
{
  "mcpServers": {
    "documentalist": {
      "url": "https://votre-domaine/mcp",
      "headers": {
        "Authorization": "Bearer VOTRE_CLE_MCP"
      }
    }
  }
}
```

Pour les documentations publiques, omettez `headers`. La forme exacte du fichier de configuration dépend du client. Cette version propose des clés Bearer configurées manuellement, et non un parcours OAuth interactif : les clients imposant OAuth ne peuvent pas se connecter aux espaces privés avec cette méthode.

Les outils disponibles sont `list_spaces`, `list_pages`, `search_docs` et `read_page`. Les réponses donnent les identifiants, la langue, la version et les URL permettant de citer les pages. La recherche et le sommaire acceptent des filtres par espace, langue et version ; le sommaire propose aussi un filtre par onglet. Les listes utilisent `offset`, `limit` et `nextOffset`. La lecture renvoie le Markdown publié par tranches de 50 000 caractères, avec `nextOffset` si nécessaire.

Les agents ne voient ni les brouillons, ni les pages masquées ou situées sous un parent masqué, ni les réglages, commentaires ou secrets de l’application. Une clé donne accès aux espaces explicitement cochés, y compris privés, dans la limite des droits actuels du compte associé. Un espace ajouté ultérieurement n’est pas autorisé automatiquement. Chaque version documentaire constitue un espace distinct. La clé ne remplace pas un code ou lien magique du portail : elle représente une autorisation d’accès documentaire distincte, accordée par l’administrateur.

Les clés expirent après 1 à 365 jours et sont stockées uniquement sous forme d’empreinte SHA-256. La révocation, la désactivation du compte et les réductions de sa portée sont appliquées à la requête suivante. La gestion des connexions affiche la dernière utilisation ; les appels d’outils authentifiés sont inscrits dans le journal d’activité avec l’identifiant de connexion, sans enregistrer la clé ni la recherche. Les requêtes sont limitées à 120 par minute et par connexion, et à 60 par minute pour l’accès public partagé.

Après mise à jour de l’application, la migration SQLite crée automatiquement les tables nécessaires. Le reverse proxy doit transmettre `/mcp` et l’en-tête `Authorization`, comme les autres routes. Configurez `DOCUMENTALIST_URL` avec l’URL HTTPS publique pour obtenir des citations correctes. Aucun port supplémentaire n’est requis.

## Vérifications

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:http
npx playwright install chromium
npm run test:browser
npm audit --omit=dev
```

Les tests utilisent des répertoires temporaires et ne touchent pas les données de travail. Les tests HTTP lancent une version compilée pour couvrir installation, connexion, rôles, protection des portails, absence de secrets, publication, import/export, révisions, sauvegardes et refus des destinations réseau internes. Les intégrations nécessitant un compte externe restent à vérifier avec les accès de cet environnement. La CI exécute ces vérifications sur Node.js 22.
