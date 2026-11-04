# Maintenir la documentation de Documentalist

## Surfaces à mettre à jour

Le README décrit installation, exploitation, sécurité et limites. Le guide intégré Product docs est construit depuis src/lib/product-guide-reference.ts et src/lib/product-guide-learn.ts. Chaque entrée contient titre et contenu anglais/français. Le constructeur src/lib/product-guide.ts transforme ce Markdown en documents TipTap, avec une section explicite et des identifiants stables.

Le document accessibility-validation-2026-11-01.md est un compte rendu historique, pas une qualification des versions futures. Les exemples de l’espace API docs sont fictifs. .env.example, compose.yaml, les scripts de bootstrap/déploiement et les workflows sont la référence opérationnelle à comparer au README.

## Mettre à jour un parcours

1. Lire la commande réelle dans le composant et la route serveur correspondants. Distinguer un bouton visible d’une action effectivement autorisée.
2. Mettre à jour la référence pour le comportement et les limites, puis Learn pour la procédure. Décrire prérequis, libellés exacts, étapes, résultat observable et récupération.
3. Mettre à jour les deux langues. Dans le guide anglais, conserver les libellés français des commandes de rédaction tant que cette interface les utilise.
4. Garder identifiant, slug et section d’une page existante. Une traduction française utilise le même slug, un identifiant suffixé _fr et translationOf vers l’anglais. Les catégories parentes sont traduites également.
5. Incrémenter PRODUCT_GUIDE_VERSION pour actualiser les installations existantes. Les pages officielles sont gérées par l’application et leurs modifications locales peuvent être remplacées. Conserver les contenus personnalisés dans des pages distinctes.
6. Si le comportement touche l’exploitation, mettre aussi à jour le README et .env.example si nécessaire.
7. Vérifier constructeur, migration et parcours HTTP/navigateur. Tester Learn et Reference avec lang=en et lang=fr.

## Actualisation des installations existantes

La migration actualise les brouillons des pages officielles et ajoute les traductions et guides manquants. Les autres documents restent inchangés. Si Product docs possède déjà une publication, seules les pages officielles sont rafraîchies dans cet instantané ; les pages personnalisées déjà publiées et les valeurs de variables capturées sont conservées. Les brouillons personnalisés ne sont pas publiés par cette opération. Un Product docs non publié le reste. Un espace Product docs absent n’est pas recréé silencieusement.

Ce mécanisme concerne le guide intégré seulement : il ne publie pas les nouvelles versions d’une documentation métier. Après fusion et déploiement, vérifier les pages réellement servies. Une validation locale n’établit pas que la production a été mise à jour.

## Repères d’implémentation

| Sujet | Sources |
| --- | --- |
| Rôles et portée | src/lib/auth.ts, src/lib/api.ts, src/app/api/admin/team/route.ts |
| Invitations, expiration et SMTP | src/lib/auth.ts, src/lib/email.ts, src/components/TeamPanel.tsx |
| Portails et invitations nominatives | src/lib/store.ts, src/lib/portal.ts, src/app/api/spaces/[spaceId]/access/invites/route.ts |
| Commandes, langues et versions | src/components/WorkspaceApp.tsx, src/lib/store.ts |
| Propriété GitHub et synchronisation | src/lib/document-access.ts, src/components/SpaceSyncPanel.tsx, src/lib/store.ts |
| Imports et limites | src/lib/github.ts, src/lib/remote-imports.ts, src/lib/integrations.ts |
| Contexte IA envoyé | src/app/api/ai/route.ts, src/lib/ai-context.ts, src/lib/ai-excerpts.ts, src/lib/llm.ts |
| MCP | src/app/mcp/route.ts, src/lib/mcp-access.ts, src/lib/mcp-server.ts, src/components/McpConnections.tsx |
| Sauvegardes et révisions | src/lib/database.ts, src/lib/store.ts, src/app/api/admin/backup/route.ts |
| Hébergement | .env.example, compose.yaml, .github/workflows/, scripts de production |

## Limites à conserver dans les guides

- Traduire crée une copie liée ; aucun moteur de traduction automatique n’est appelé.
- La synchronisation automatique s’exécute depuis un espace ouvert et ne publie pas.
- GitHub reste propriétaire des pages importées tant que la source est liée ; le détachement ne pousse rien vers le dépôt.
- Le mode Question classe les extraits dans l’espace actif ; son sélecteur ne garantit pas un contexte limité à une page.
- Variables, modèles et extraits ne disposent pas d’un éditeur de gestion complet dans l’interface actuelle.
- Portail, comptes d’équipe et clés MCP ont des autorisations distinctes. SSO et OAuth MCP interactif ne sont pas implémentés.
- Le job de déploiement s’exécute uniquement après la réussite de la CI sur main ; il annule si la branche a avancé, construit le SHA validé et vérifie /login après redémarrage.
