# RGPD : guide d’exploitation

Documentalist est un logiciel libre pouvant être installé et configuré par des organisations différentes. Le projet ne connaît pas le responsable de traitement d’une instance et ne peut pas fixer à sa place les finalités, bases légales, durées adaptées, destinataires ou transferts. L’exploitant doit adapter ce guide à son contexte avant d’ouvrir l’instance à des utilisateurs.

## Avant d’ouvrir l’instance

1. Déterminez qui décide des finalités et des moyens du traitement, et indiquez son nom légal et son adresse dans la notice. Identifiez aussi un contact pour les demandes et, si nécessaire, le DPO.
2. Décrivez chaque finalité et sa base légale dans `DOCUMENTALIST_PRIVACY_BASES`. Déterminez si les personnes sont salariées, clientes, lecteurs invités ou autres catégories, et adaptez les textes qui leur sont présentés.
3. Inventoriez l’hébergeur et les services réellement activés : SMTP, fournisseur d’IA, GitHub/GitLab/Notion, webhooks, MCP et outils d’exploitation. Dans `DOCUMENTALIST_PRIVACY_RECIPIENTS`, précisez leurs rôles, leurs noms et les données transmises.
4. Vérifiez les lieux de stockage et d’accès de chaque fournisseur. Décrivez les transferts hors EEE et leurs garanties dans `DOCUMENTALIST_PRIVACY_TRANSFERS`, ou indiquez qu’il n’y en a pas.
5. Vérifiez les contrats et instructions applicables aux sous-traitants, les durées proposées par ceux-ci, les mesures de sécurité, les conditions de suppression et les éventuels usages secondaires des données.
6. Publiez la notice `/privacy` et vérifiez-la après configuration. Les champs marqués « À compléter » signalent que la notice n’est pas prête à informer les personnes.

Exemple de configuration, à remplacer par des informations exactes :

```dotenv
DOCUMENTALIST_PRIVACY_CONTROLLER="Organisation responsable"
DOCUMENTALIST_PRIVACY_ADDRESS="Adresse postale"
DOCUMENTALIST_PRIVACY_CONTACT=privacy@example.org
# DOCUMENTALIST_PRIVACY_DPO="Coordonnées si un DPO est désigné"
DOCUMENTALIST_PRIVACY_BASES="Finalités et bases légales réellement retenues"
DOCUMENTALIST_PRIVACY_RECIPIENTS="Hébergeur, SMTP, IA et autres services activés"
DOCUMENTALIST_PRIVACY_TRANSFERS="Pays de traitement et garanties, ou aucun transfert hors EEE"
```

## Demandes des personnes

Les membres connectés peuvent télécharger un export lié à leur compte ou demander la suppression du compte depuis « Équipe et activité ». L’export contient le profil, les accès aux espaces, les commentaires attribués, les événements de journal associés, les invitations de portail et les connexions MCP du compte. Il ne contient ni mots de passe, ni empreintes de jetons, ni secrets d’intégration.

La suppression efface le compte, ses sessions, ses jetons, ses accès MCP, ses invitations par adresse e-mail, ses événements d’activité associés, ses commentaires attribués et les mêmes références dans les instantanés internes. Elle purge également les fichiers `documentalist-*.sqlite` présents dans le répertoire local `data/backups` et le fichier de migration `legacy-backup.enc`, afin qu’ils ne puissent pas restaurer le compte. Les anciens commentaires sans identifiant de compte sont supprimés si le nom correspond à un seul compte ; si plusieurs comptes portent ce nom, leur auteur et leur texte sont remplacés par une mention neutre.

Les modifications de pages et les contenus de documentation partagés ne sont pas attribués aux comptes par cette version. Une demande d’effacement peut donc nécessiter une revue humaine des contenus concernés, une décision documentée sur leur maintien ou leur suppression, et une intervention de l’exploitant. Les portails invités sans compte peuvent être retirés d’un espace par un administrateur ; la personne peut aussi utiliser le contact indiqué dans la notice.

L’exploitant reste chargé d’accuser réception, vérifier la demande de manière proportionnée, la traiter dans les délais applicables (généralement un mois), documenter une éventuelle limitation ou exception, et répondre à la personne. La suppression d’un compte ne doit pas être présentée comme la suppression automatique de chaque copie, export, journal du fournisseur ou sauvegarde externe.

## Conservation et sauvegardes

Les valeurs par défaut de l’application sont : événements d’activité 180 jours (et 5 000 entrées maximum), instantanés internes 30 jours (et 20 révisions maximum), sauvegardes de fichiers produites par `npm run data:backup` 30 jours. Les valeurs peuvent être ajustées avec `DOCUMENTALIST_ACTIVITY_RETENTION_DAYS`, `DOCUMENTALIST_SNAPSHOT_RETENTION_DAYS` et `DOCUMENTALIST_BACKUP_RETENTION_DAYS`, entre 1 et 3650 jours. Choisissez des durées justifiées par les besoins et obligations de l’instance.

La purge des instantanés internes et des jetons expirés se fait lors de l’utilisation de l’application, au plus une fois par heure. Les sauvegardes locales de fichiers et la copie de migration expirées sont purgées à la prochaine activité de l’application ; `npm run data:backup` purge aussi les anciennes sauvegardes locales. Les téléchargements depuis `/team`, les copies hôte, réplications, sauvegardes du fournisseur cloud et exports téléchargés ne sont pas gérés par cette purge. Restreignez-les, définissez une durée et supprimez-les à échéance.

Avant de restaurer une ancienne copie externe, réappliquez les demandes d’effacement survenues depuis sa création ou éliminez la copie si elle ne peut pas être remise en conformité. Une sauvegarde conservée pour reprise doit être protégée contre l’usage courant et restaurée seulement par du personnel autorisé.

## Sécurité et incidents

L’application chiffre le payload documentaire de SQLite avec AES-256-GCM et hache les mots de passe avec scrypt. Les colonnes de comptes, sessions, activité et certains accès sont séparées dans SQLite et ne sont pas chiffrées par l’application ; protégez le volume avec les permissions système, des ACL, le chiffrement au repos et des sauvegardes chiffrées. Gardez la clé de chiffrement séparée et contrôlez les accès d’administration.

Utilisez HTTPS, gardez les dépendances et le système à jour, désactivez les comptes et clés inutilisés, limitez les droits par espace, restreignez l’accès aux exports et surveillez les journaux de l’hébergeur. N’envoyez à un fournisseur IA que les données nécessaires et vérifiez ses engagements contractuels avant d’activer l’intégration.

Préparez une procédure pour contenir une violation, préserver les éléments utiles, évaluer le risque pour les personnes, informer le responsable/DPO et, lorsque cela s’applique, notifier l’autorité de contrôle et les personnes concernées dans les délais réglementaires.

## Références CNIL

- [Informer les personnes et assurer la transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)
- [Les premières étapes de conformité](https://www.cnil.fr/fr/passer-laction/rgpd-les-premieres-etapes)
- [Gérer la sous-traitance](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
- [Tracer les opérations](https://www.cnil.fr/fr/securite-tracer-les-operations)

Ce guide est une documentation technique et opérationnelle ; il ne remplace pas l’analyse de conformité juridique propre à l’exploitant.
