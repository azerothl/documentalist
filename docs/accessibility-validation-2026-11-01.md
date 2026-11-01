# Validation ciblée avec NVDA — 1er novembre 2026

Statut : **21 étapes terminées, aucune erreur de parcours enregistrée après correction**.

Environnement : Windows, Microsoft Edge, NVDA 2026.3 en français. NVDA a réellement traité les événements du navigateur et son tampon de lecture ; ses annonces ont été enregistrées avant synthèse vocale avec le pilote de test officiel de NV Access. Le contrôle du processus et du champ actif a confirmé que les commandes visaient la fenêtre de test.

Les essais utilisent une instance locale et des documents fictifs, distincts des données de travail.

## Parcours vérifiés

- En-tête compact : compte et contexte documentaire alignés à 1 230 px, hauteur de 95 px.
- Nom et rôle de l’éditeur et du champ de commentaire.
- Ouverture des préférences, Tab, Maj+Tab, fermeture et retour du focus.
- Annonce d’une recherche sans résultat.
- Onglets : nom, sélection et navigation par flèche.
- Lien d’évitement et navigation par titres dans le portail.
- Tableau : dimensions, en-têtes et contenu.
- Tâches cochées et non cochées, navigation par case et lecture continue.
- Nom du lien vers la page suivante.
- Ouverture du menu Documents avec une largeur de fenêtre de 390 px.

## Corrections confirmées lors du second passage

1. **Tâches lues deux fois en lecture continue.** Les cases sont désormais associées à leur texte visible par un `label` natif. Chaque libellé apparaît une seule fois dans la lecture continue ; la navigation par case annonce toujours son nom et son état. Les paragraphes complémentaires et sous-tâches restent présents.
2. **Texte du lien suivant concaténé.** Le nom accessible distingue maintenant la direction et le titre : « Page suivante : Étape suivante ». Le même traitement est appliqué au lien précédent.

## Vérifications complémentaires

Compilation, lint, vérification TypeScript et 11 résultats de tests navigateur réussis après correction. Les contrôles navigateur incluent axe, les thèmes, le repli à 320 px et les libellés des tâches imbriquées.

Le détail des annonces est conservé dans [evidence/nvda-2026-11-01.json](evidence/nvda-2026-11-01.json). Cette vérification couvre les parcours ci-dessus avec ce couple navigateur/lecteur d’écran ; elle ne constitue pas une certification générale de conformité WCAG ni un essai sur un appareil mobile réel.
