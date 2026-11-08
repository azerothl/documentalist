---
name: documentalist-docs
description: Prépare ou maintient la documentation d’un dépôt GitHub pour l’import dans Documentalist. Utiliser lors de la création, de la migration ou de la modification d’un projet destiné à Documentalist, pour organiser Reference, Learn et Blog, régler la navigation et fournir les paramètres d’import.
---

# Préparer la documentation pour Documentalist

## Adapter l’arborescence au projet

1. Repérer la documentation, les guides du dépôt, le générateur de site éventuel et les paramètres Documentalist connus. Reprendre les racines déjà utilisées lorsqu’elles conviennent. La synchronisation identifie les pages par leur chemin source et leur langue. Avant un déplacement nécessaire, corriger les liens et les références du générateur, puis signaler le changement de chemin pour la prochaine synchronisation.
2. Pour un nouveau projet, utiliser `docs/reference/` pour les API, commandes, options et comportements de référence. Ajouter `docs/learn/` pour les démarrages rapides, tutoriels et procédures pas à pas, et `docs/blog/` pour les notes de version, selon le contenu disponible. Pour une documentation avec une seule section, `docs/` convient comme racine Reference. Conserver le `README.md` à la racine du dépôt comme présentation du projet, avec des liens vers la documentation.
3. Utiliser des chemins relatifs à la racine du dépôt, avec `/` comme séparateur. Reference est configurée à chaque import GitHub. Renseigner Learn ou Blog uniquement si la racine correspondante contient des pages. Les racines configurées doivent être distinctes. En cas de chevauchement, le fichier est affecté à la racine la plus précise. Garder les brouillons et la documentation interne hors des racines importées.
4. Lors d’une modification du projet, mettre à jour les pages concernées par les changements d’installation, d’usage, d’API ou de configuration. Ajuster la navigation si des pages sont ajoutées, retirées ou déplacées. Tirer les commandes, options et versions du projet et de son historique.

## Organiser les pages et la navigation

- Écrire en Markdown UTF-8. L’import GitHub reconnaît `.md`, `.mdx` et `.markdown`. Préférer `.md` pour les nouvelles pages. Si un MDX dépend de composants ou de JavaScript, prévoir une version Markdown lisible pour Documentalist, qui n’exécute pas le JavaScript MDX.
- Donner un titre explicite à chaque page. Documentalist prend d’abord le champ `title` du frontmatter, puis un titre Markdown détecté, puis le nom du fichier. Ajouter `description` si elle apporte un résumé utile. Écrire les champs consommés par Documentalist au début du fichier, à raison d’une valeur simple par ligne entre deux lignes `---`. Pour `tags`, utiliser une valeur telle que `api, configuration`.
- Dans chaque racine Reference ou Learn, utiliser un `README.md` ou un `index.md` avec des liens vers les pages. Si un ordre explicite est nécessaire, tenir un `SUMMARY.md` à la racine de l’onglet, avec des liens Markdown relatifs et une extension explicite, comme `[Configuration](./configuration.md)`. L’ordre suit les liens résolus du `SUMMARY.md` en priorité. À défaut, Documentalist parcourt les liens du `README.md` ou de l’`index.md` racine, puis classe les pages restantes par frontmatter numérique (`sidebar_position` ou `nav_order`, par exemple), préfixe numérique et tri naturel. Les dossiers forment les catégories. Un `SUMMARY.md` peut aussi apparaître comme page importée, donc lui donner un titre lisible s’il est ajouté.
- Dans Blog, utiliser un fichier par version et renseigner la date réelle sous la forme `date: 2026-01-15` dans le frontmatter, ou dans le nom du fichier (`2026-01-15-v1.2.0.md`, par exemple). Documentalist affiche les notes à plat, de la plus récente à la plus ancienne. Un `README.md` ou `index.md` racine sans date peut servir d’introduction.
- Garder les liens relatifs dans les index qui pilotent l’ordre d’import et vérifier la casse des chemins. Le portail génère sa navigation à partir des pages importées. Pour les liens qui doivent aussi être cliquables dans le corps des pages du portail, utiliser une URL HTTPS de destination vérifiée. Signaler les liens relatifs importants à revoir lorsque la destination sur le portail reste inconnue. Le portail charge les images à leur URL. Utiliser des URL HTTPS durables et accessibles au public prévu. Vérifier le rendu des liens et des images si un aperçu est disponible.

## Fournir les paramètres d’import

Créer ou mettre à jour `.documentalist/import.json`, hors des racines de documentation recommandées. Ce fichier est un profil partagé dans le dépôt. Il reprend les noms de champs de l’API GitHub de Documentalist (`POST /api/github/import`). L’application conserve la configuration dans l’espace après l’import. Reporter les valeurs dans **Importer depuis GitHub** ou utiliser le JSON comme corps de requête si l’utilisateur a demandé l’import via l’API.

```json
{
  "repository": "organisation/projet",
  "branch": "main",
  "path": "docs/reference",
  "learnPath": "docs/learn",
  "blogPath": "docs/blog",
  "format": "auto",
  "locale": "fr"
}
```

- Renseigner le dépôt GitHub et la branche destinés à l’import, qui peuvent différer de la branche de travail. Si ces valeurs restent inconnues, omettre les clés correspondantes et indiquer celles à compléter avant l’import. L’API exige `repository` et utilise `main` par défaut pour `branch`.
- Associer `path` à **Dossier docs** (Reference), `learnPath` à **Dossier Learn** et `blogPath` à **Dossier Blog**. Omettre les clés des sections facultatives absentes. Choisir `locale` selon la langue du contenu importé. Le réglage concerne l’ensemble de l’import.
- Conserver les autres paramètres déjà choisis. Garder les jetons hors du dépôt. Le fichier JSON sert de mémo de configuration et de corps de requête. Documentalist ne le lit pas automatiquement depuis GitHub.

## Vérifier avant de livrer

Valider la syntaxe du JSON, l’existence des racines et la présence d’au moins une page dans chacune après répartition. Contrôler les liens de navigation, l’ordre souhaité et les dates de Blog. L’import GitHub plafonne à 500 fichiers Markdown par racine interrogée, avant la répartition entre onglets si les racines se chevauchent.

Indiquer les valeurs à saisir dans Documentalist et distinguer la validation locale d’un import effectivement testé. La préparation des fichiers s’arrête au dépôt local. N’effectuer un push, un import, une synchronisation ou une publication que dans le cadre d’une demande qui les autorise.
