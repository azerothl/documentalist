import Link from "next/link";
import { AppearanceSettings } from "@/components/Appearance";
import { listSpaces } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const spaces = (await listSpaces()).filter(
    (s) => s.isPublic && s.publishedSnapshot,
  );
  const published = spaces.filter((s) => s.publishedSnapshot);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh">
      <div className="landing-grid border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pb-16 pt-10">
          <nav className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">
              Documentalist
            </span>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <AppearanceSettings />
              <Link
                href="/app"
                className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                Ouvrir l’espace de rédaction
              </Link>
              <Link
                href="/app"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--on-accent)]"
              >
                Commencer à écrire
              </Link>
            </div>
          </nav>

          <div className="max-w-2xl pt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Portails de documentation
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--ink)] md:text-5xl">
              Documentalist
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)]">
              Organisez vos guides, rédigez avec des blocs et publiez un portail
              consultable et accessible à votre équipe.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="rounded-md bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--bg)]"
              >
                Rédiger la documentation
              </Link>
              {published[0] ? (
                <Link
                  href={`/p/${published[0].slug}`}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm"
                >
                  Consulter {published[0].name}
                </Link>
              ) : (
                <span className="rounded-md border border-dashed border-[var(--line)] px-4 py-2.5 text-sm text-[var(--ink-faint)]">
                  Publiez un espace pour ouvrir son portail
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-3">
        {[
          {
            title: "Espaces et navigation",
            body: "Pages imbriquées, classement par glisser-déposer, imports GitHub, GitLab, Notion et OpenAPI, versions et langues.",
          },
          {
            title: "Éditeur de documents",
            body: "Menu de blocs, imports Markdown, aperçu, commentaires, référencement, traductions et restauration des révisions.",
          },
          {
            title: "Portail de lecture",
            body: "Choix de version et de langue, accès protégé et notifications de publication vers Slack, Discord ou un webhook.",
          },
        ].map((item) => (
          <div key={item.title}>
            <h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
              {item.body}
            </p>
          </div>
        ))}
      </section>

      <section className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            Documentation publiée
          </h2>
          <ul className="mt-6 divide-y divide-[var(--line)]">
            {spaces.map((space) => (
              <li
                key={space.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <div className="font-medium">{space.name}</div>
                  <div className="text-sm text-[var(--ink-faint)]">
                    /{space.slug}
                    {space.publishedAt ? " · publié" : " · brouillon"}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <Link
                    href="/app"
                    className="text-[var(--accent)] hover:underline"
                  >
                    Rédiger
                  </Link>
                  {space.publishedSnapshot ? (
                    <Link
                      href={`/p/${space.slug}`}
                      className="text-[var(--ink-muted)] hover:underline"
                    >
                      Consulter
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
