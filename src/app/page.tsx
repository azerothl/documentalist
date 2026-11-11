import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  FileText,
  LayoutPanelLeft,
  PenLine,
} from "lucide-react";
import { AppearanceSettings, ThemeToggle } from "@/components/Appearance";
import { BrandLogo } from "@/components/BrandLogo";
import { FasstDots } from "@/components/FasstDots";
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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="site-nav">
        <div className="site-nav-inner mx-auto max-w-7xl">
          <Link href="/" className="site-brand">
            <BrandLogo height={30} priority />
          </Link>
          <div className="site-nav-end">
            <ThemeToggle />
            <AppearanceSettings variant="icon" />
            <Link href="/app" className="site-tab hidden sm:inline-flex">
              Espace de rédaction
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1">
        <section className="home-hero">
          <div className="home-hero-inner">
            <p className="eyebrow">Portails de documentation</p>
            <h1 className="home-title mt-6 flex justify-center">
              <BrandLogo height={88} priority />
            </h1>
            <p className="home-subtitle">
              Organisez vos guides, rédigez avec des blocs et publiez un portail
              consultable et accessible à votre équipe.
            </p>
            <div className="home-actions">
              <Link href="/app" className="primary-button button-lg">
                Rédiger la documentation
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              {spaces[0] ? (
                <Link
                  href={`/p/${spaces[0].slug}`}
                  className="secondary-button button-lg"
                >
                  Consulter {spaces[0].name}
                </Link>
              ) : (
                <span className="secondary-button button-lg border-dashed text-[var(--ink-faint)]">
                  Publiez un espace pour ouvrir son portail
                </span>
              )}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="features-title"
          className="home-section bg-[var(--wash)]"
        >
          <div className="home-section-head">
            <h2 id="features-title" className="home-section-title">
              Ce que fait Documentalist
            </h2>
            <p className="home-section-lead">
              La rédaction, la publication et la lecture se font au même
              endroit.
            </p>
          </div>
          <ul className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card bg-[var(--surface)]">
                <span className="home-feature-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3 className="card-title mt-5 text-xl">{title}</h3>
                <p className="card-text text-[0.9375rem]">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="portals-title" className="home-section">
          <div className="home-section-head">
            <h2 id="portals-title" className="home-section-title">
              Documentation publiée
            </h2>
          </div>
          {spaces.length ? (
            <ul className="card-grid mx-auto max-w-6xl">
              {spaces.map((space) => {
                const docs = space.publishedSnapshot?.documents ?? [];
                const tabs = DOC_SECTIONS.filter((t) =>
                  docs.some((d) => !d.hidden && docSection(d) === t.id),
                );
                return (
                  <li key={space.id}>
                    <Link
                      href={`/p/${space.slug}`}
                      className="card flex h-full flex-col"
                    >
                      <span className="flex items-start gap-3">
                        <span
                          className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"
                          aria-hidden="true"
                        >
                          <FileText size={20} />
                        </span>
                        <span className="min-w-0">
                          <span className="card-title block text-xl">
                            {space.name}
                          </span>
                          <span className="card-meta block">/{space.slug}</span>
                        </span>
                      </span>
                      {tabs.length ? (
                        <span className="mt-4 flex flex-wrap gap-1.5">
                          {tabs.map((t) => (
                            <span key={t.id} className="chip">
                              {t.label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className="card-more mt-auto pt-6">
                        Consulter
                        <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-center text-[var(--ink-muted)]">
              Aucun espace publié pour le moment.
            </p>
          )}
        </section>

        <section aria-labelledby="start-title" className="fasst-band">
          <FasstDots />
          <div className="home-section relative">
            <div className="home-section-head mb-0">
              <h2 id="start-title" className="home-section-title">
                Publiez votre premier portail
              </h2>
              <p className="home-section-lead">
                Créez un espace, rédigez une page, puis choisissez qui peut la
                lire : tout le monde, les personnes qui ont le code ou des
                lecteurs invités.
              </p>
              <div className="home-actions">
                <Link href="/app" className="primary-button button-lg">
                  Ouvrir l’espace de rédaction
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer pt-12">
        <div className="site-footer-inner">
          <div className="footer-brand">
            <BrandLogo height={26} />
            <span>Documentation des produits et des équipes.</span>
          </div>
          <nav aria-label="Pied de page" className="footer-links">
            <div className="footer-col">
              <p className="footer-heading">Produit</p>
              <Link href="/app">Espace de rédaction</Link>
              <Link href="/team">Équipe et activité</Link>
            </div>
            <div className="footer-col">
              <p className="footer-heading">Plus</p>
              <Link href="/privacy">Confidentialité</Link>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
