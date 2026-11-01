import Link from "next/link";
import { BookOpen, FileText, LayoutPanelLeft, PenLine } from "lucide-react";
import { AppearanceSettings } from "@/components/Appearance";
import { listSpaces } from "@/lib/store";
import { DOC_SECTIONS, docSection } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: LayoutPanelLeft,
    title: "Espaces et navigation",
    body: "Pages imbriquées, classement par glisser-déposer, imports GitHub, GitLab, Notion et OpenAPI, versions et langues.",
  },
  {
    icon: PenLine,
    title: "Éditeur de documents",
    body: "Menu de blocs, imports Markdown, aperçu, commentaires, référencement, traductions et restauration des révisions.",
  },
  {
    icon: BookOpen,
    title: "Portail de lecture",
    body: "Onglets Learn, Reference et Blog, choix de version et de langue, accès protégé et notifications de publication vers Slack, Discord ou un webhook.",
  },
];

export default async function HomePage() {
  const spaces = (await listSpaces()).filter(
    (s) => s.isPublic && s.publishedSnapshot,
  );
  const published = spaces.filter((s) => s.publishedSnapshot);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="site-nav">
        <div className="site-nav-inner mx-auto max-w-6xl">
          <Link href="/" className="site-brand">
            <span className="site-logo-mark" aria-hidden="true">
              D
            </span>
            <span className="site-brand-name">Documentalist</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <AppearanceSettings variant="icon" />
            <Link href="/app" className="site-tab hidden sm:inline-flex">
              Ouvrir l’espace de rédaction
            </Link>
            <Link href="/app" className="primary-button">
              Commencer à écrire
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1">
        <section className="border-b border-[var(--line)] bg-[var(--wash)]">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-16 text-center md:pt-24">
            <span
              className="site-logo-mark"
              aria-hidden="true"
              style={{ width: 72, height: 72, fontSize: 36, borderRadius: 20 }}
            >
              D
            </span>
            <p className="eyebrow mt-8">Portails de documentation</p>
            <h1 className="page-title mt-3 text-5xl md:text-6xl">
              Documentalist
            </h1>
            <p className="page-lead max-w-xl">
              Organisez vos guides, rédigez avec des blocs et publiez un portail
              consultable et accessible à votre équipe.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/app"
                className="primary-button min-h-12 px-6 text-base"
              >
                Rédiger la documentation
              </Link>
              {published[0] ? (
                <Link
                  href={`/p/${published[0].slug}`}
                  className="secondary-button min-h-12 px-6 text-base"
                >
                  Consulter {published[0].name}
                </Link>
              ) : (
                <span className="secondary-button min-h-12 border-dashed px-6 text-base text-[var(--ink-faint)]">
                  Publiez un espace pour ouvrir son portail
                </span>
              )}
            </div>
          </div>
        </section>

        <section
          aria-label="Fonctions"
          className="mx-auto grid max-w-6xl gap-5 px-6 py-16 md:grid-cols-3"
        >
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card">
              <span
                className="inline-grid h-11 w-11 place-items-center rounded-xl bg-[var(--cream-soft)] text-[var(--ocre)]"
                aria-hidden="true"
              >
                <Icon size={22} />
              </span>
              <h2 className="card-title mt-5 text-xl">{title}</h2>
              <p className="card-text text-sm">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="eyebrow">Portails</p>
            <h2 className="mt-2 text-3xl font-bold text-[var(--heading)]">
              Documentation publiée
            </h2>
            {spaces.length ? (
              <ul className="card-grid mt-8">
                {spaces.map((space) => {
                  const docs = space.publishedSnapshot?.documents ?? [];
                  const tabs = DOC_SECTIONS.filter((t) =>
                    docs.some((d) => !d.hidden && docSection(d) === t.id),
                  );
                  return (
                    <li key={space.id} className="card flex flex-col">
                      <div className="flex items-start gap-3">
                        <span
                          className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"
                          aria-hidden="true"
                        >
                          <FileText size={20} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="card-title text-xl">{space.name}</h3>
                          <p className="card-meta">
                            /{space.slug}
                            {space.publishedAt ? " · publié" : " · brouillon"}
                          </p>
                        </div>
                      </div>
                      {tabs.length ? (
                        <p className="mt-4 flex flex-wrap gap-1.5">
                          {tabs.map((t) => (
                            <span key={t.id} className="chip">
                              {t.label}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      <div className="mt-auto flex gap-2 pt-6">
                        <Link
                          href={`/p/${space.slug}`}
                          className="secondary-button"
                        >
                          Consulter
                        </Link>
                        <Link href="/app" className="site-tab">
                          Rédiger
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-6 text-[var(--ink-muted)]">
                Aucun espace publié pour le moment.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
