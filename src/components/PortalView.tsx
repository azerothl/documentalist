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
import { PortalLocaleSync } from "@/components/PortalLocaleSync";
import { accentStyle } from "@/lib/appearance";
import { getPortalUi } from "@/lib/portal-i18n";
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
  const { language: uiLanguage, messages: t } = getPortalUi(locale);
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
          aria-label={t.controls.space}
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
          aria-label={t.controls.version}
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
          aria-label={t.controls.language}
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
      <p className="sidebar-heading">{t.sections.blog}</p>
      <ul>
        <li className="sidebar-row">
          <Link
            href={href(undefined, locale, "blog")}
            className="sidebar-link"
            data-depth="0"
            aria-current={showBlogIndex ? "page" : undefined}
            onClick={() => setNavigationOpen(false)}
          >
            {t.sidebar.allReleaseNotes}
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
                    {formatPostDate(post.date, locale)}
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
      <p className="sidebar-heading">{t.sections[activeSection]}</p>
      {tree.length ? (
        <SidebarTree
          nodes={tree}
          activeId={current?.id}
          trail={current ? documentTrail(sectionDocs, current.id) : []}
          href={(doc) => href(doc)}
          onNavigate={() => setNavigationOpen(false)}
          locale={locale}
        />
      ) : (
        <p className="px-5 text-sm text-[var(--ink-muted)]">
          {t.sidebar.noPagesInTab(locale)}
        </p>
      )}
    </>
  );

  const sectionTabs = (className: string) => (
    <nav aria-label={t.controls.sections} className={className}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tabHref(tab.id)}
          className="site-tab"
          aria-current={tab.id === activeSection ? "page" : undefined}
          onClick={() => setNavigationOpen(false)}
        >
          {t.sections[tab.id]}
        </Link>
      ))}
    </nav>
  );

  return (
    <div
      lang={uiLanguage}
      className="reader-shell flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]"
      style={accentStyle(space.accentColor, theme)}
    >
      <PortalLocaleSync
        language={uiLanguage}
        skipLinkLabel={t.skipToContent}
      />
      <header className="site-nav reader-header">
        <div className="site-nav-inner">
          <button
            type="button"
            className="site-icon-button lg:hidden"
            aria-haspopup="dialog"
            aria-expanded={navigationOpen}
            aria-label={t.documents}
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
              aria-label={t.search.label}
              placeholder={t.search.placeholder}
              autoComplete="off"
            />
            <kbd aria-hidden="true">Ctrl K</kbd>
          </div>
          {sectionTabs("site-tabs ml-auto hidden md:flex")}
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            {account ? (
              <AccountNavigation user={account} locale={locale} />
            ) : null}
            {!internal ? (
              <>
                <AppearanceSettings variant="icon" locale={locale} />
                <Link
                  href="/app"
                  className="site-icon-button"
                  aria-label={t.writingSpace}
                  title={t.writingSpace}
                >
                  <PenLine size={20} aria-hidden="true" />
                </Link>
              </>
            ) : (
              <span className="chip">{t.readOnly}</span>
            )}
          </div>
        </div>
        {query.trim() ? (
          <section
            aria-label={t.search.results}
            className="site-search-results"
          >
            <p
              role="status"
              className="px-3 pb-2 text-sm text-[var(--ink-muted)]"
            >
              {results.length
                ? t.search.resultCount(results.length, query)
                : t.search.noResults(query)}
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
                          {t.sections[docSection(doc)]}
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
                {t.search.tryAnother}
              </p>
            )}
          </section>
        ) : null}
      </header>
      {tabs.length > 1 ? sectionTabs("site-mobile-tabs md:hidden") : null}

      <div className="site-body reader-layout">
        <nav
          id="portal-navigation"
          aria-label={t.sidebar.nav}
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
              locale={locale}
            />
          ) : current && content ? (
            <article lang={locale} className="site-article reading-document">
              <nav aria-label={t.breadcrumb}>
                <ol className="breadcrumbs">
                  <li>
                    <Link href={tabHref(activeSection)}>
                      {t.sections[activeSection]}
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
                    {formatPostDate(current.date, locale)}
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
                  {t.hiddenPage}
                </p>
              ) : null}
              {extractHeadings(content).length ? (
                <details className="page-contents mt-6 xl:hidden">
                  <summary className="cursor-pointer py-2 font-semibold">
                    {t.onThisPage}
                  </summary>
                  <TocPanel content={content} locale={locale} />
                </details>
              ) : null}
              {contentEmpty && children.length ? null : (
                <DocumentContent content={content} locale={locale} />
              )}
              {children.length ? (
                <section aria-label={t.children} className="mt-10">
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
                  aria-label={t.pager.nav}
                  className="pager"
                >
                  {previous ? (
                    <Link
                      href={href(previous)}
                      aria-label={t.pager.previousPage(previous.title)}
                      className="pager-card page-step"
                      data-direction="previous"
                    >
                      <ArrowLeft size={22} aria-hidden="true" />
                      <span>
                        <span className="pager-label">
                          {isBlog ? t.pager.newer : t.pager.previous}
                        </span>
                        <span className="pager-title">{previous.title}</span>
                      </span>
                    </Link>
                  ) : null}
                  {next ? (
                    <Link
                      href={href(next)}
                      aria-label={t.pager.nextPage(next.title)}
                      className="pager-card page-step"
                      data-direction="next"
                    >
                      <span>
                        <span className="pager-label">
                          {isBlog ? t.pager.older : t.pager.next}
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
              <h1 className="page-title">{t.sections[activeSection]}</h1>
              <p className="page-lead">
                {t.noPages(locale)}
              </p>
            </div>
          )}
        </main>
        {content && !showBlogIndex ? (
          <aside className="site-toc" aria-label={t.tableOfContents}>
            <PageToc content={content} tags={current?.tags} locale={locale} />
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
          <nav aria-label={t.footer.nav}>
            {tabs.map((tab) => (
              <Link key={tab.id} href={tabHref(tab.id)}>
                {t.sections[tab.id]}
              </Link>
            ))}
            <Link href="/privacy">Confidentialité / Privacy</Link>
          </nav>
          <span className="inline-flex items-center gap-2">
            {t.footer.publishedWith}
            <BrandLogo height={22} />
          </span>
        </div>
      </footer>

      <Dialog
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title={t.mobileNavigation}
        closeLabel={t.close}
        lang={uiLanguage}
        className="navigation-dialog"
      >
        <nav id="portal-mobile-navigation" aria-label={t.sidebar.nav}>
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
  locale,
  depth = 0,
}: {
  nodes: DocTreeNode[];
  activeId?: string;
  trail: DocumentRecord[];
  href: (doc: DocumentRecord) => string;
  onNavigate: () => void;
  locale: string;
  depth?: number;
}) {
  const { messages } = getPortalUi(locale);
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
                  <span className="sr-only">
                    {messages.sidebar.externalLink}
                  </span>
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
                  aria-label={
                    expanded
                      ? messages.sidebar.collapse(node.title)
                      : messages.sidebar.expand(node.title)
                  }
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
                locale={locale}
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
  locale,
}: {
  content: TipTapDoc;
  tags?: string[];
  locale: string;
}) {
  const { language, messages } = getPortalUi(locale);
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
    <nav aria-label={messages.onThisPage} lang={language}>
      {headings.length ? (
        <>
          <p className="toc-heading">{messages.onThisPage}</p>
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
          <p className="toc-heading">{messages.tags}</p>
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
  locale,
}: {
  spaceName: string;
  intro?: DocumentRecord;
  posts: DocumentRecord[];
  href: (doc: DocumentRecord) => string;
  varMap: Record<string, string>;
  locale: string;
}) {
  const { messages } = getPortalUi(locale);
  return (
    <div className="site-article">
      <p className="eyebrow">{messages.blog.releaseNotes}</p>
      <h1 className="page-title mt-2">{messages.sections.blog}</h1>
      <p className="page-lead">
        {applyVariables(
          intro?.seoDescription ||
            introParagraph(intro) ||
            messages.blog.defaultDescription(spaceName),
          varMap,
        )}
      </p>
      <ul className="blog-list" aria-label={messages.blog.articles}>
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={href(post)} className="card">
              <h2 className="card-title">{post.title}</h2>
              {post.date ? (
                <p className="card-meta">
                  <time dateTime={post.date}>
                    {formatPostDate(post.date, locale)}
                  </time>
                </p>
              ) : null}
              {excerpt(post) ? (
                <p className="card-text">{excerpt(post)}</p>
              ) : null}
              <span className="card-more">
                {messages.blog.readMore}{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
