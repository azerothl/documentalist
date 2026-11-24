# Recette locale des échéances de lecture

23 novembre 2026, Windows, Node.js 24.12.0, Next.js 16.4.6. La recette porte sur la branche de cette PR, issue de `947429b`, avec une base SQLite temporaire et des adresses fictives. Elle ne valide pas un déploiement existant.

La suite `npm test` vérifie la date UTC, la conservation des invitations sans échéance, la modification de date, la révocation et l’indépendance de deux espaces. `npm run test:http` démarre l’application compilée et vérifie un lien direct et une session avant puis après une modification de l’échéance vers une date passée. Un ancien lien est refusé et une nouvelle demande ne crée pas de jeton après l’échéance. La révocation bloque la session. L’invitation est préparée dans la base de recette : aucun courriel réel n’est envoyé et la livraison SMTP n’est pas vérifiée.

Le parcours navigateur existant, le build, le lint, le typage et `npm audit --omit=dev` passent localement. Les captures du README ont été régénérées et relues. Pour une version déployée, rejouer la recette avec sa révision exacte et son propre SMTP avant d’enregistrer l’échéance comme vérifiée en production.
