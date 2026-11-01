"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Menu,
  PenLine,
  Search,
} from "lucide-react";
import { AppearanceSettings, useAppearance } from "@/components/Appearance";
import { BrandLogo } from "@/components/BrandLogo";
import { Dialog } from "@/components/Dialog";
import {
  AccountNavigation,
  type AccountIdentity,
} from "@/components/AccountNavigation";
import { DocumentContent } from "@/components/DocumentContent";
import { TocPanel } from "@/components/TocPanel";
import { accentStyle } from "@/lib/appearance";
import { buildTree, findByPath, flattenTree, pathSlugs } from "@/lib/tree";
import { documentTrail, readingContent, searchExcerpt } from "@/lib/reading";
import {
  compareBlogPosts,
  formatPostDate,
  isBlogIntro,
  sectionDocuments,
} from "@/lib/sections";
import {
  applyVariables,
  extractHeadings,
  extractText,
} from "@/lib/tiptap-text";
import {
  DOC_SECTIONS,
  docSection,
  type DocSection,
  type DocTreeNode,
  type DocumentRecord,
  type Space,
  type TipTapDoc,
  type TipTapNode,
  type Variable,
} from "@/lib/types";

type Props = {
  space: Pick<Space, "id" | "name" | "slug" | "accentColor" | "locales">;
  versionSpaces: Pick<Space, "id" | "slug" | "versionLabel">[];
  documents: DocumentRecord[];
  variables: Variable[];
  /** Slugs inside the active tab (public portal) */
  path: string[];
  locale: string;
  /** Active tab; defaults to the first tab with content */
  section?: DocSection;
  /** Internal reader: open this document directly */
  documentId?: string;
  internal?: boolean;
  account?: AccountIdentity;
  availableSpaces?: Pick<Space, "id" | "name">[];
};

function mapNode(node: TipTapNode, vars: Record<string, string>): TipTapNode {
  return {
    ...node,
    ...(node.text ? { text: applyVariables(node.text, vars) } : {}),
    ...(node.content
      ? { content: node.content.map((n) => mapNode(n, vars)) }
      : {}),
  };
}

const SECTION_LABEL = Object.fromEntries(
  DOC_SECTIONS.map((s) => [s.id, s.label]),
) as Record<DocSection, string>;

function excerpt(doc: DocumentRecord, length = 220) {
  if (doc.seoDescription) return doc.seoDescription;
  const text = extractText(doc.content).replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export function PortalView({
  space,
  versionSpaces,
  documents,
  variables,
  path,
  locale,
  section: requestedSection,
  documentId,
  internal = false,
  account,
  availableSpaces = [],
}: Props) {
  const router = useRouter();
  const { theme } = useAppearance();
  const [query, setQuery] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () =>
      documents.filter((d) => (internal || !d.hidden) && d.locale === locale),
    [documents, locale, internal],
  );
  const bySection = useMemo(() => {
    const out = {} as Record<DocSection, DocumentRecord[]>;
    for (const s of DOC_SECTIONS) out[s.id] = sectionDocuments(visible, s.id);
    return out;
  }, [visible]);
  const tabs = DOC_SECTIONS.filter((s) => bySection[s.id].length > 0);

  const requestedDoc = documentId
    ? visible.find((d) => d.id === documentId)
    : undefined;
  const activeSection: DocSection =
    requestedSection ??
    (requestedDoc ? docSection(requestedDoc) : undefined) ??
    (path.length ? "reference" : (tabs[0]?.id ?? "reference"));
  const sectionDocs = bySection[activeSection];
  const isBlog = activeSection === "blog";
  const tree = useMemo(() => buildTree(sectionDocs), [sectionDocs]);
  const blogIntro = isBlog ? sectionDocs.find(isBlogIntro) : undefined;
  const ordered = isBlog
    ? sectionDocs
        .filter((d) => d.kind === "page" && d.id !== blogIntro?.id)
        .sort(compareBlogPosts)
    : flattenTree(tree);
  const pages = ordered.filter((d) => d.kind === "page");

  const showBlogIndex =
    isBlog && !requestedDoc && path.length === 0 && pages.length > 0;
  const current = showBlogIndex
    ? undefined
    : requestedDoc && docSection(requestedDoc) === activeSection
      ? sectionDocs.find((d) => d.id === requestedDoc.id)
      : path.length
        ? (findByPath(sectionDocs, path) ?? pages[0])
        : (pages[0] ?? ordered[0]);

  const varMap = Object.fromEntries(variables.map((v) => [v.key, v.value]));
  const title = current
    ? applyVariables(current.seoTitle || current.title, varMap)
    : isBlog
      ? "Blog"
      : space.name;
  const content: TipTapDoc | null = current
    ? readingContent(
        {
          type: "doc",
          content: current.content.content?.map((n) => mapNode(n, varMap)),
        },
        title,
      )
    : null;
  const contentEmpty = !content || !extractText(content).trim();
  const children = current
    ? ordered.filter((d) => d.parentId === current.id)
    : [];

  const allPages = visible.filter((d) => d.kind === "page");
  const results = query.trim()
    ? allPages.filter((d) =>
        `${d.title} ${(d.tags ?? []).join(" ")} ${extractText(d.content)}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : [];

  const index = current ? ordered.findIndex((d) => d.id === current.id) : -1;
  const previous =
    index > 0
      ? ordered
          .slice(0, index)
          .reverse()
          .find((d) => d.kind === "page")
      : undefined;
  const next =
    index >= 0
      ? ordered.slice(index + 1).find((d) => d.kind === "page")
      : undefined;

  function href(
    doc?: DocumentRecord,
    language = locale,
    tab: DocSection = doc ? docSection(doc) : activeSection,
  ) {
    if (internal)
      return `/app?${new URLSearchParams({
        space: space.id,
        ...(doc ? { doc: doc.id } : { section: tab }),
        lang: language,
      })}`;
    const slugs = doc ? pathSlugs(bySection[tab], doc.id) : [];
    return `/p/${space.slug}/${tab}${slugs.length ? "/" + slugs.join("/") : ""}?${new URLSearchParams({ lang: language })}`;
  }
  function tabHref(tab: DocSection) {
    if (internal && tab !== "blog") {
      const first = bySection[tab].find((d) => d.kind === "page");
      if (first) return href(first, locale, tab);
    }
    return href(undefined, locale, tab);
  }

  // Ctrl/Cmd+K or "/" focuses the search field, as on react.dev.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.closest("input, textarea, select, [contenteditable='true']") !=
        null;
      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") ||
        (!typing && event.key === "/")
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const currentVersion = versionSpaces.find((s) => s.id === space.id);

  const controls = (
    <div className="grid gap-2 px-5 pb-4">
      {internal ? (
        <select
          aria-label="Espace de documentation"
          value={space.id}
          onChange={(e) =>
            router.push(`/app?space=${encodeURIComponent(e.target.value)}`)
          }
          className="reader-select w-full"
        >
          {availableSpaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Version de la documentation"
          className="reader-select w-full"
          value={space.id}
          onChange={(e) => {
            const target = versionSpaces.find((s) => s.id === e.target.value);
            if (target)
              router.push(
                internal
                  ? `/app?space=${target.id}&lang=${locale}`
                  : `/p/${target.slug}?lang=${locale}`,
              );
          }}
        >
          {versionSpaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.versionLabel}
            </option>
          ))}
        </select>
        <select
          aria-label="Langue de la documentation"
          className="reader-select w-full"
          value={locale}
          onChange={(e) => router.push(href(undefined, e.target.value))}
        >
          {(space.locales ?? [locale]).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const sidebar = isBlog ? (
    <>
      <p className="sidebar-heading">Blog</p>
      <ul>
        <li className="sidebar-row">
          <Link
            href={href(undefined, locale, "blog")}
            className="sidebar-link"
            data-depth="0"
            aria-current={showBlogIndex ? "page" : undefined}
            onClick={() => setNavigationOpen(false)}
          >
            Toutes les notes de version
          </Link>
        </li>
        {pages.map((post) => (
          <li key={post.id} className="sidebar-row">
            <Link
              href={href(post)}
              className="sidebar-link"
              data-depth="1"
              aria-current={post.id === current?.id ? "page" : undefined}
              onClick={() => setNavigationOpen(false)}
            >
              <span>
                {post.title}
                {post.date ? (
                  <span className="sidebar-date">
                    {formatPostDate(post.date)}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  ) : (
    <>
      <p className="sidebar-heading">{SECTION_LABEL[activeSection]}</p>
      {tree.length ? (
        <SidebarTree
          nodes={tree}
          activeId={current?.id}
          trail={current ? documentTrail(sectionDocs, current.id) : []}
          href={(doc) => href(doc)}
          onNavigate={() => setNavigationOpen(false)}
        />
      ) : (
        <p className="px-5 text-sm text-[var(--ink-muted)]">
          Aucune page dans cet onglet pour la langue « {locale} ».
        </p>
      )}
    </>
  );

  const sectionTabs = (className: string) => (
    <nav aria-label="Sections de la documentation" className={className}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tabHref(tab.id)}
          className="site-tab"
          aria-current={tab.id === activeSection ? "page" : undefined}
          onClick={() => setNavigationOpen(false)}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div
      className="reader-shell flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]"
      style={accentStyle(space.accentColor, theme)}
    >
      <header className="site-nav reader-header">
        <div className="site-nav-inner">
          <button
            type="button"
            className="site-icon-button lg:hidden"
            aria-haspopup="dialog"
            aria-expanded={navigationOpen}
            aria-label="Documents"
            onClick={() => setNavigationOpen(true)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <Link
            href={tabHref(tabs[0]?.id ?? "reference")}
            className="site-brand"
          >
            <span className="site-logo-mark" aria-hidden="true">
              {space.name.trim().charAt(0).toUpperCase() || "D"}
            </span>
            <span className="site-brand-name">{space.name}</span>
          </Link>
          {currentVersion ? (
            <span className="site-version hidden sm:inline">
              {currentVersion.versionLabel}
            </span>
          ) : null}
          <div className="site-search">
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              type="search"
              aria-label="Rechercher dans la documentation"
              placeholder="Rechercher"
              autoComplete="off"
            />
            <kbd aria-hidden="true">Ctrl K</kbd>
          </div>
          {sectionTabs("site-tabs ml-auto hidden md:flex")}
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            {account ? <AccountNavigation user={account} /> : null}
            {!internal ? (
              <>
                <AppearanceSettings variant="icon" />
                <Link
                  href="/app"
                  className="site-icon-button"
                  aria-label="Espace de rédaction"
                  title="Espace de rédaction"
                >
                  <PenLine size={20} aria-hidden="true" />
                </Link>
              </>
            ) : (
              <span className="chip">Lecture seule</span>
            )}
          </div>
        </div>
        {query.trim() ? (
          <section
            aria-label="Résultats de recherche"
            className="site-search-results"
          >
            <p
              role="status"
              className="px-3 pb-2 text-sm text-[var(--ink-muted)]"
            >
              {results.length
                ? `${results.length} résultat${results.length > 1 ? "s" : ""} pour « ${query} ».`
                : `Aucun résultat pour « ${query} ».`}
            </p>
            {results.length ? (
              <ul className="flex flex-col gap-1">
                {results.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={href(doc)}
                      onClick={() => {
                        setQuery("");
                        setNavigationOpen(false);
                      }}
                      className="search-hit search-result"
                    >
                      <span className="search-hit-title">
                        {doc.title}
                        <span className="section-pill">
                          {SECTION_LABEL[docSection(doc)]}
                        </span>
                      </span>
                      <span className="block text-sm text-[var(--ink-muted)]">
                        {documentTrail(bySection[docSection(doc)], doc.id)
                          .map((d) => d.title)
                          .join(" / ")}
                      </span>
                      <span className="block text-sm" lang={doc.locale}>
                        {searchExcerpt(doc.content, query)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 text-sm text-[var(--ink-muted)]">
                Essayez un autre mot ou changez de langue.
              </p>
            )}
          </section>
        ) : null}
      </header>
      {tabs.length > 1 ? sectionTabs("site-mobile-tabs md:hidden") : null}

      <div className="site-body reader-layout">
        <nav
          id="portal-navigation"
          aria-label="Documents de l’espace"
          className="site-sidebar"
        >
          {controls}
          {sidebar}
        </nav>
        <main id="main-content" tabIndex={-1} className="site-main">
          {showBlogIndex ? (
            <BlogIndex
              spaceName={space.name}
              intro={blogIntro}
              posts={pages}
              href={href}
              varMap={varMap}
            />
          ) : current && content ? (
            <article lang={locale} className="site-article reading-document">
              <nav aria-label="Fil d’Ariane">
                <ol className="breadcrumbs">
                  <li>
                    <Link href={tabHref(activeSection)}>
                      {SECTION_LABEL[activeSection]}
                    </Link>
                  </li>
                  {documentTrail(sectionDocs, current.id)
                    .slice(0, -1)
                    .map((d) => (
                      <li key={d.id} className="flex items-center gap-1.5">
                        <ChevronRight size={14} aria-hidden="true" />
                        <Link href={href(d)}>{d.title}</Link>
                      </li>
                    ))}
                  <li className="sr-only" aria-current="page">
                    {current.title}
                  </li>
                </ol>
              </nav>
              <h1 className="page-title">{title}</h1>
              {isBlog && current.date ? (
                <p className="page-meta">
                  <time dateTime={current.date}>
                    {formatPostDate(current.date)}
                  </time>
                </p>
              ) : null}
              {current.seoDescription ? (
                <p className="page-lead">
                  {applyVariables(current.seoDescription, varMap)}
                </p>
              ) : null}
              {current.hidden && internal ? (
                <p className="mt-4 text-sm text-[var(--ink-muted)]">
                  Page masquée du portail public.
                </p>
              ) : null}
              {extractHeadings(content).length ? (
                <details className="page-contents mt-6 xl:hidden">
                  <summary className="cursor-pointer py-2 font-semibold">
                    Sur cette page
                  </summary>
                  <TocPanel content={content} />
                </details>
              ) : null}
              {contentEmpty && children.length ? null : (
                <DocumentContent content={content} />
              )}
              {children.length ? (
                <section aria-label="Pages de cette rubrique" className="mt-10">
                  <div className="card-grid">
                    {children.map((child) => (
                      <Link key={child.id} href={href(child)} className="card">
                        <h2 className="card-title text-xl">{child.title}</h2>
                        {excerpt(child, 140) ? (
                          <p className="card-text text-sm">
                            {excerpt(child, 140)}
                          </p>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
              {previous || next ? (
                <nav
                  aria-label="Pages précédente et suivante"
                  className="pager"
                >
                  {previous ? (
                    <Link
                      href={href(previous)}
                      aria-label={`Page précédente : ${previous.title}`}
                      className="pager-card page-step"
                      data-direction="previous"
                    >
                      <ArrowLeft size={22} aria-hidden="true" />
                      <span>
                        <span className="pager-label">
                          {isBlog ? "Plus récent" : "Précédent"}
                        </span>
                        <span className="pager-title">{previous.title}</span>
                      </span>
                    </Link>
                  ) : null}
                  {next ? (
                    <Link
                      href={href(next)}
                      aria-label={`Page suivante : ${next.title}`}
                      className="pager-card page-step"
                      data-direction="next"
                    >
                      <span>
                        <span className="pager-label">
                          {isBlog ? "Plus ancien" : "Suivant"}
                        </span>
                        <span className="pager-title">{next.title}</span>
                      </span>
                      <ArrowRight size={22} aria-hidden="true" />
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </article>
          ) : (
            <div className="site-article">
              <h1 className="page-title">{SECTION_LABEL[activeSection]}</h1>
              <p className="page-lead">
                Aucune page dans la langue « {locale} ». Changez de langue ou
                d’onglet pour consulter les documents disponibles.
              </p>
            </div>
          )}
        </main>
        {content && !showBlogIndex ? (
          <aside className="site-toc" aria-label="Sommaire de la page">
            <PageToc content={content} tags={current?.tags} />
          </aside>
        ) : null}
      </div>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span className="site-brand">
            <span className="site-logo-mark" aria-hidden="true">
              {space.name.trim().charAt(0).toUpperCase() || "D"}
            </span>
            <span className="site-brand-name">{space.name}</span>
          </span>
          <nav aria-label="Pied de page">
            {tabs.map((tab) => (
              <Link key={tab.id} href={tabHref(tab.id)}>
                {tab.label}
              </Link>
            ))}
          </nav>
          <span className="inline-flex items-center gap-2">
            Documentation publiée avec
            <BrandLogo height={22} />
          </span>
        </div>
      </footer>

      <Dialog
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title="Documents"
        className="navigation-dialog"
      >
        <nav id="portal-mobile-navigation" aria-label="Documents de l’espace">
          {tabs.length > 1 ? (
            <div className="mb-4 px-1">
              {sectionTabs("site-tabs flex-wrap")}
            </div>
          ) : null}
          {controls}
          {sidebar}
        </nav>
      </Dialog>
    </div>
  );
}

function SidebarTree({
  nodes,
  activeId,
  trail,
  href,
  onNavigate,
  depth = 0,
}: {
  nodes: DocTreeNode[];
  activeId?: string;
  trail: DocumentRecord[];
  href: (doc: DocumentRecord) => string;
  onNavigate: () => void;
  depth?: number;
}) {
  // Top-level groups start open; deeper ones open along the active path.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const onTrail = new Set(trail.map((d) => d.id));
  return (
    <ul>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const expanded = open[node.id] ?? (depth === 0 || onTrail.has(node.id));
        const indent = `${20 + depth * 16}px`;
        return (
          <li key={node.id}>
            <div className="sidebar-row">
              {node.kind === "link" && node.href ? (
                <a
                  href={node.href}
                  className="sidebar-link"
                  data-depth={depth}
                  style={{ "--indent": indent } as React.CSSProperties}
                  target="_blank"
                  rel="noreferrer"
                  onClick={onNavigate}
                >
                  {node.title}
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              ) : (
                <Link
                  href={href(node)}
                  className="sidebar-link"
                  data-depth={depth}
                  style={{ "--indent": indent } as React.CSSProperties}
                  aria-current={node.id === activeId ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {node.title}
                </Link>
              )}
              {hasChildren ? (
                <button
                  type="button"
                  className="sidebar-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Replier" : "Déplier"} ${node.title}`}
                  onClick={() =>
                    setOpen((prev) => ({ ...prev, [node.id]: !expanded }))
                  }
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {hasChildren && expanded ? (
              <SidebarTree
                nodes={node.children}
                activeId={activeId}
                trail={trail}
                href={href}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Right-hand "On this page" list that follows the reading position. */
function PageToc({
  content,
  tags = [],
}: {
  content: TipTapDoc;
  tags?: string[];
}) {
  const headings = extractHeadings(content)
    .map((h, index) => ({ ...h, anchor: `section-${index}` }))
    .filter((h) => h.level <= 3);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

  useEffect(() => {
    const targets = headings
      .map((h) => document.getElementById(h.anchor))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;
    const update = () => {
      let currentAnchor = targets[0].id;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= 120) currentAnchor = el.id;
        else break;
      }
      setActiveAnchor(currentAnchor);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!headings.length && !tags.length) return null;
  const minLevel = Math.min(...headings.map((h) => h.level), 3);
  return (
    <nav aria-label="Sur cette page" lang="fr">
      {headings.length ? (
        <>
          <p className="toc-heading">Sur cette page</p>
          <ul>
            {headings.map((h) => (
              <li key={h.anchor}>
                <a
                  href={`#${h.anchor}`}
                  className="toc-link"
                  style={
                    {
                      "--indent": `${12 + (h.level - minLevel) * 14}px`,
                    } as React.CSSProperties
                  }
                  aria-current={
                    h.anchor === activeAnchor ? "location" : undefined
                  }
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {tags.length ? (
        <div className="mt-8">
          <p className="toc-heading">Tags</p>
          <div className="toc-tags">
            {tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * First paragraph of the blog root README/index. Its other blocks often list
 * the posts by hand, which the cards below already do.
 */
function introParagraph(intro?: DocumentRecord) {
  // Skip raw HTML/JSX left as text by the MDX import.
  const paragraph = intro?.content.content?.find((node) => {
    const text = node.type === "paragraph" ? extractText(node).trim() : "";
    return text && !text.startsWith("<");
  });
  return paragraph ? extractText(paragraph).trim() : "";
}

function BlogIndex({
  spaceName,
  intro,
  posts,
  href,
  varMap,
}: {
  spaceName: string;
  intro?: DocumentRecord;
  posts: DocumentRecord[];
  href: (doc: DocumentRecord) => string;
  varMap: Record<string, string>;
}) {
  return (
    <div className="site-article">
      <p className="eyebrow">Notes de version</p>
      <h1 className="page-title mt-2">Blog</h1>
      <p className="page-lead">
        {applyVariables(
          intro?.seoDescription ||
            introParagraph(intro) ||
            `Les nouveautés et notes de version de ${spaceName}.`,
          varMap,
        )}
      </p>
      <ul className="blog-list" aria-label="Articles">
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={href(post)} className="card">
              <h2 className="card-title">{post.title}</h2>
              {post.date ? (
                <p className="card-meta">
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                </p>
              ) : null}
              {excerpt(post) ? (
                <p className="card-text">{excerpt(post)}</p>
              ) : null}
              <span className="card-more">
                Lire la suite <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
