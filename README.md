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
- `/p/{slug}` : portail publié, avec choix de version et de langue.

Pour les réglages d’hébergement, partir de [.env.example](.env.example). `DOCUMENTALIST_URL` doit correspondre à l’URL réellement ouverte par les utilisateurs. En production, utiliser HTTPS ; pour un serveur de production **local sur HTTP**, définir explicitement `DOCUMENTALIST_COOKIE_SECURE=false`.

```sh
npm run build
npm start
```

La compilation utilise webpack et un correctif ciblé pour les volumes Windows qui renvoient une erreur incorrecte pour `readlink`. Le correctif est inactif sur les autres systèmes.

## Fonctions disponibles

| Fonction                | Comportement                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Espaces et arborescence | Pages, catégories, liens, glisser-déposer, détection des cycles et des slugs en double                                                 |
| Édition                 | Blocs `/`, tableaux, tâches, images par URL, encadrés, coloration du code et aperçu                                                    |
| Sauvegarde              | File de sauvegarde par document, attente avant publication, alerte si la page est quittée avant enregistrement, révisions restaurables |
| Publication             | Instantané des documents et variables, pages masquées exclues côté serveur, retrait possible via le réglage Public                     |
| Portail                 | Lecture sans charger TipTap, sommaire avec ancres, recherche avec état vide, menu mobile, versions et langues                          |
| Accès                   | Administrateur, rédacteur et lecteur ; mot de passe de portail vérifié côté serveur avec cookie HttpOnly                               |
| IA                      | Question, rédaction et correction sur le contexte de la page avec OpenAI, Anthropic ou une API compatible                              |
| Import/export           | Markdown ; adaptation GFM, Obsidian et MDX sans exécuter de JavaScript                                                                 |
| GitHub                  | Import d’un arbre Markdown/MDX dans un nouvel espace, avec token facultatif                                                            |
| GitLab                  | Import d’un arbre Markdown/MDX dans un nouvel espace, hôte et token configurables                                                      |
| Notion                  | Import de la page partagée et de ses sous-pages, avec pagination ; les blocs non convertis sont signalés                               |
| OpenAPI                 | JSON ou YAML : paramètres, corps de requête, réponses, schémas locaux et sécurité                                                      |
| Notifications           | Slack, Discord et webhook de publication ; succès et échecs consignés dans l’activité                                                  |

Les intégrations sont accessibles aux administrateurs dans Outils → Intégrations. Enregistrer la connexion avant l’import GitLab/Notion. Les imports sont des copies à la demande, sans synchronisation continue. Limites : 80 fichiers/pages pour GitLab et Notion, 2 000 blocs Notion, 200 opérations OpenAPI. Les références OpenAPI externes ne sont pas téléchargées. Les images Notion hébergées par Notion peuvent expirer ; elles ne sont pas copiées dans un stockage média.

Les lecteurs disposent d’une vue en lecture seule, y compris pour les documents non publiés. Les rédacteurs peuvent modifier et publier tous les espaces. Les administrateurs gèrent aussi les secrets, les accès et les comptes. Les droits sont vérifiés par le serveur, sans dépendre des boutons de l’interface. Les commentaires utilisent le nom du compte connecté.

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

Les secrets ne sont jamais renvoyés en clair au navigateur. Le masque `••••••••` signifie « conserver la valeur » ; remplacer le champ pour changer le secret, ou le vider pour le supprimer. Le CSS libre a été retiré ; la couleur d’accent reste configurable.

Les requêtes sortantes vérifient les adresses DNS au moment de la connexion, refusent les réseaux privés par défaut, les protocoles dangereux et les redirections ; elles limitent aussi le temps et la taille des réponses. Les exceptions réseau sont configurées uniquement par l’opérateur dans `DOCUMENTALIST_PRIVATE_HOSTS`.

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
