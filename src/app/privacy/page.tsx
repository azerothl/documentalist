import Link from "next/link";
import { getPrivacyNoticeConfig, getRetentionPolicy } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Confidentialité — Documentalist",
  robots: { index: false, follow: true },
};

function Value({ children }: { children: string }) {
  return children ? (
    <p className="whitespace-pre-wrap">{children}</p>
  ) : (
    <p className="text-[var(--warning)]">À compléter par l’exploitant.</p>
  );
}

export default function PrivacyNotice() {
  const config = getPrivacyNoticeConfig();
  const retention = getRetentionPolicy();
  const emailContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contact);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-8 px-4 py-10"
    >
      <Link href="/login" className="text-[var(--accent)] underline">
        ← Retour à Documentalist
      </Link>
      <header className="space-y-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold">
          Confidentialité et données personnelles
        </h1>
        <p className="text-[var(--ink-muted)]">
          Notice d’information à personnaliser par l’exploitant de cette
          instance.
        </p>
      </header>

      {!config.configured && (
        <aside
          role="status"
          className="rounded border border-[var(--warning)] bg-[var(--warning-soft)] p-4"
        >
          <strong>Notice incomplète.</strong> L’exploitant doit renseigner son
          identité, son adresse, un contact, les bases légales, les
          destinataires et les transferts dans l’environnement du serveur. Les
          mentions « À compléter » ne constituent pas une information juridique
          suffisante.
        </aside>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="text-2xl font-semibold">Qui traite les données ?</h2>
        <dl className="grid gap-4">
          <div>
            <dt className="font-semibold">Responsable de traitement</dt>
            <dd><Value>{config.controller}</Value></dd>
          </div>
          <div>
            <dt className="font-semibold">Adresse</dt>
            <dd><Value>{config.address}</Value></dd>
          </div>
          <div>
            <dt className="font-semibold">Contact pour la vie privée</dt>
            <dd>
              {emailContact ? (
                <a className="text-[var(--accent)] underline" href={"mailto:" + config.contact}>
                  {config.contact}
                </a>
              ) : (
                <Value>{config.contact}</Value>
              )}
            </dd>
          </div>
          {config.dpo && (
            <div>
              <dt className="font-semibold">Délégué à la protection des données</dt>
              <dd><Value>{config.dpo}</Value></dd>
            </div>
          )}
        </dl>
        <p>
          Documentalist est un logiciel libre auto-hébergeable. Le responsable
          de traitement et les rôles des parties dépendent de l’organisation
          qui exploite cette instance et des usages qu’elle en fait.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-2xl font-semibold">Données et finalités</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Comptes : nom, adresse e-mail, rôle, espaces autorisés, mot de passe
            sous forme de hachage et données de session, pour gérer
            l’authentification et les accès.
          </li>
          <li>
            Exploitation et sécurité : actions effectuées dans l’application,
            identifiants de compte associés et limites anti-abus, pour
            administrer le service et traiter les incidents.
          </li>
          <li>
            Documentation : pages, commentaires, paramètres et publications
            enregistrés par l’organisation, pour fournir l’espace de rédaction
            et les portails.
          </li>
          <li>
            Invitations et liens d’accès : adresses e-mail, jetons temporaires
            et empreintes de jetons, pour envoyer et contrôler les accès. Les
            adresses invitées sont conservées tant que l’invitation reste dans
            l’espace ; les jetons et accès expirés sont purgés.
          </li>
          <li>
            Services activés par l’exploitant : les prompts, extraits de
            documentation et réponses peuvent être transmis au fournisseur d’IA
            configuré. SMTP transmet les adresses et liens d’invitation. Les
            intégrations d’import et les webhooks peuvent transmettre les pages
            ou événements sélectionnés à leurs fournisseurs.
          </li>
        </ul>
        <h3 className="text-lg font-semibold">Bases légales</h3>
        <Value>{config.legalBases}</Value>
        <p className="text-sm text-[var(--ink-muted)]">
          L’exploitant doit déterminer et expliquer la base légale pour chaque
          finalité. Le logiciel ne choisit pas cette base à sa place.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-2xl font-semibold">Destinataires et transferts</h2>
        <h3 className="text-lg font-semibold">Destinataires et prestataires</h3>
        <Value>{config.recipients}</Value>
        <h3 className="text-lg font-semibold">Transferts hors EEE</h3>
        <Value>{config.transfers}</Value>
        <p className="text-sm text-[var(--ink-muted)]">
          L’exploitant doit nommer les fournisseurs réellement utilisés, leurs
          pays de traitement et, le cas échéant, les garanties de transfert.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-2xl font-semibold">Conservation et sécurité</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Sessions d’équipe : 8 heures au maximum.</li>
          <li>Liens de création de compte : 24 heures ; réinitialisation : 1 heure.</li>
          <li>Liens magiques : 24 heures ; sessions de portail : 8 heures.</li>
          <li>
            Clés MCP : les empreintes et métadonnées sont supprimées après
            expiration ou révocation.
          </li>
          <li>
            Journal d’activité : {retention.activityDays} jours au maximum, avec
            une limite supplémentaire de 5 000 entrées.
          </li>
          <li>
            Instantanés internes de récupération : {retention.snapshotDays}{" "}
            jours et 20 révisions au maximum.
          </li>
          <li>
            Fichiers produits par <code>npm run data:backup</code> : les
            fichiers Documentalist plus anciens que {retention.backupDays} jours
            sont purgés à la prochaine activité de l’application ou à la prochaine
            sauvegarde. La copie chiffrée de migration est purgée après{" "}
            {retention.snapshotDays} jours. Les téléchargements et autres copies
            gérés hors de l’application suivent la politique de l’exploitant. Une
            suppression de compte purge les sauvegardes locales générées et la
            copie de migration.
          </li>
          <li>
            Comptes et documentation : tant qu’ils sont nécessaires à
            l’organisation, puis selon les demandes d’effacement et les
            obligations de conservation applicables.
          </li>
        </ul>
        <p>
          Le contenu documentaire enregistré dans la base est chiffré avec
          AES-256-GCM. L’application demande des permissions privées pour le
          répertoire de données, la base et la clé sur les systèmes compatibles.
          Les colonnes d’identité de SQLite ne sont pas chiffrées par l’application ;
          l’exploitant doit protéger les fichiers, les sauvegardes téléchargées et
          la clé avec les contrôles du système et du stockage.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-2xl font-semibold">Vos droits</h2>
        <p>
          Selon la situation et la base légale, vous pouvez demander l’accès, la
          rectification, l’effacement ou la limitation du traitement, vous
          opposer au traitement et demander la portabilité lorsque ce droit
          s’applique. Vous pouvez également déposer une réclamation auprès de
          l’autorité de contrôle compétente.
        </p>
        <p>
          Les membres connectés peuvent télécharger une copie des données de
          leur compte et demander sa suppression depuis « Équipe et activité ».
          La suppression du compte ne supprime pas les documents de
          l’organisation, qui ne sont pas attribués à un auteur dans cette
          version. Les lecteurs invités sans compte peuvent contacter
          l’exploitant pour faire corriger ou retirer leur adresse d’invitation.
          L’exploitant répond aux demandes dans les délais prévus par la réglementation.
        </p>
        <p>
          Pour exercer un droit ou poser une question, utilisez le contact vie
          privée indiqué plus haut. En France, vous pouvez aussi saisir la{" "}
          <a
            className="text-[var(--accent)] underline"
            href="https://www.cnil.fr/"
            rel="noreferrer"
            target="_blank"
          >
            CNIL
          </a>
          .
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-2xl font-semibold">Cookies et préférences</h2>
        <p>
          L’application utilise des cookies nécessaires à l’authentification et
          à l’accès protégé aux portails. Les préférences d’apparence sont
          stockées dans le stockage local du navigateur. Aucun outil publicitaire
          ou de mesure d’audience n’est inclus dans le code de base.
        </p>
      </section>

      <section className="card space-y-3 p-5" lang="en">
        <h2 className="text-2xl font-semibold">English summary</h2>
        <p>
          This self-hosted open-source application does not choose the data
          controller, legal bases, providers, or international transfer
          safeguards. The operator must complete the fields above before using
          this notice. The listed technical retention periods are defaults and
          can be changed by the operator.
        </p>
        <p>
          Signed-in users can export their account data or request account
          deletion from Team & activity. Organization documentation remains
          with the organization. Portal readers without accounts should contact
          the operator using the privacy contact above.
        </p>
      </section>
    </main>
  );
}
