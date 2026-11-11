# Instructions pour les agents

## Documentation

- À la création d’un projet dont la documentation sera importée dans Documentalist, appliquer la [skill `documentalist-docs`](.agents/skills/documentalist-docs/SKILL.md) pour organiser les pages, la navigation et le profil d’import. Appliquer aussi la skill après toute modification de ce projet qui touche l’installation, l’usage, l’API ou la configuration. Mettre à jour les pages concernées, ainsi que la navigation et le profil si leurs paramètres évoluent.
- Pour toute modification du produit Documentalist qui affecte le comportement documenté, suivre le [guide de maintenance documentaire](docs/documentation-maintenance.md). Mettre à jour les parties concernées du README et du guide intégré Product docs. Maintenir les versions française et anglaise des pages du guide.

## README

- Mettre à jour le README dans le même commit que toute modification du produit : fonctions, commandes, réglages et limites concernés.
- Après toute modification visible de l’interface (portail, accueil, espace de rédaction, thèmes, mobile), régénérer les captures avec `npm run build` puis `npm run docs:screenshots`. Relire chaque image de `docs/screenshots/` avant de la commiter et ajuster la section Aperçu du README si une vue apparaît ou disparaît.
