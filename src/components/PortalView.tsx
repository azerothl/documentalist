"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppearanceSettings, useAppearance } from "@/components/Appearance";
import { Dialog } from "@/components/Dialog";
import {
  AccountNavigation,
  type AccountIdentity,
} from "@/components/AccountNavigation";
import { DocumentContent } from "@/components/DocumentContent";
import { DocTree } from "@/components/DocTree";
import { TocPanel } from "@/components/TocPanel";
import { accentStyle } from "@/lib/appearance";
import { buildTree, findByPath, flattenTree, pathSlugs } from "@/lib/tree";
import { documentTrail, readingContent, searchExcerpt } from "@/lib/reading";
import { applyVariables, extractText } from "@/lib/tiptap-text";
import type {
  DocumentRecord,
  Space,
  TipTapDoc,
  TipTapNode,
  Variable,
} from "@/lib/types";

type Props = {
  space: Pick<Space, "id" | "name" | "slug" | "accentColor" | "locales">;
  versionSpaces: Pick<Space, "id" | "slug" | "versionLabel">[];
  documents: DocumentRecord[];
  variables: Variable[];
  path: string[];
  locale: string;
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

export function PortalView({
  space,
  versionSpaces,
  documents,
  variables,
  path,
  locale,
  internal = false,
  account,
  availableSpaces = [],
}: Props) {
  const router = useRouter();
  const { theme } = useAppearance();
  const [query, setQuery] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const visible = useMemo(
    () =>
      documents.filter((d) => (internal || !d.hidden) && d.locale === locale),
    [documents, locale, internal],
  );
  const tree = useMemo(() => buildTree(visible), [visible]);
  const orderedDocuments = flattenTree(tree);
  const pages = orderedDocuments.filter((d) => d.kind === "page");
  const current =
    (path.length ? findByPath(visible, path) : pages[0]) ?? pages[0];
  const varMap = Object.fromEntries(variables.map((v) => [v.key, v.value]));
  const title = current
    ? applyVariables(current.seoTitle || current.title, varMap)
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
  const results = query.trim()
    ? pages.filter((d) =>
        `${d.title} ${(d.tags ?? []).join(" ")} ${extractText(d.content)}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : [];
  const index = orderedDocuments.findIndex((d) => d.id === current?.id);
  const previous = orderedDocuments
    .slice(0, index)
    .reverse()
    .find((d) => d.kind === "page");
  const next = orderedDocuments.slice(index + 1).find((d) => d.kind === "page");
  function href(doc?: DocumentRecord, language = locale) {
    if (internal)
      return `/app?${new URLSearchParams({ space: space.id, ...(doc ? { doc: doc.id } : {}), lang: language })}`;
    return `/p/${space.slug}${doc ? "/" + pathSlugs(visible, doc.id).join("/") : ""}?${new URLSearchParams({ lang: language })}`;
  }
  const navigation = (
    <DocTree
      nodes={tree}
      activeId={current?.id}
      baseHref={(node) => href(node)}
      onNavigate={() => setNavigationOpen(false)}
    />
  );
  return (
    <div
      className="reader-shell flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]"
      style={accentStyle(space.accentColor, theme)}
    >
      <header className="reader-header flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 md:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            className="secondary-button md:hidden"
            aria-haspopup="dialog"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            Documents
          </button>
          <Link
            href={href()}
            className="break-words font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            {space.name}
          </Link>
          {internal ? (
            <select
              aria-label="Espace de documentation"
              value={space.id}
              onChange={(e) =>
                router.push(`/app?space=${encodeURIComponent(e.target.value)}`)
              }
              className="reader-select"
            >
              {availableSpaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            aria-label="Version de la documentation"
            className="reader-select"
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
            className="reader-select"
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
        {account ? <AccountNavigation user={account} /> : null}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            aria-label="Rechercher dans la documentation"
            placeholder="Rechercher…"
            className="reader-search rounded-md border border-[var(--control-line)] bg-[var(--surface)] px-3 py-2"
          />
          {!internal ? (
            <>
              <AppearanceSettings />
              <Link
                href="/app"
                className="text-sm underline underline-offset-4"
              >
                Espace de rédaction
              </Link>
            </>
          ) : (
            <span className="text-sm text-[var(--ink-muted)]">
              Lecture seule
            </span>
          )}
        </div>
      </header>

      {query.trim() ? (
        <section
          aria-label="Résultats de recherche"
          className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-4"
        >
          <p role="status" className="mx-auto mb-3 max-w-3xl text-sm">
            {results.length
              ? `${results.length} résultat${results.length > 1 ? "s" : ""} pour « ${query} ».`
              : `Aucun résultat pour « ${query} ».`}
          </p>
          {results.length ? (
            <ul className="mx-auto flex max-w-3xl flex-col gap-3">
              {results.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={href(doc)}
                    onClick={() => {
                      setQuery("");
                      setNavigationOpen(false);
                    }}
                    className="search-result block rounded-md p-2 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="block font-semibold text-[var(--accent)] underline underline-offset-4">
                      {doc.title}
                    </span>
                    <span className="block text-sm text-[var(--ink-muted)]">
                      {documentTrail(visible, doc.id)
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
            <p className="mx-auto max-w-3xl text-sm text-[var(--ink-muted)]">
              Essayez un autre mot ou changez de langue.
            </p>
          )}
        </section>
      ) : null}

      <div className="reader-layout mx-auto flex w-full max-w-[1500px] flex-1">
        <nav
          id="portal-navigation"
          aria-label="Documents de l’espace"
          className="hidden w-60 shrink-0 border-r border-[var(--line)] p-4 md:block"
        >
          {navigation}
        </nav>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 md:px-8"
        >
          {current && content ? (
            <>
              <nav
                aria-label="Fil d’Ariane"
                className="mb-5 text-sm text-[var(--ink-muted)]"
              >
                <ol className="flex flex-wrap gap-x-2 gap-y-1">
                  <li>
                    <Link
                      href={href()}
                      className="underline underline-offset-4"
                    >
                      {space.name}
                    </Link>
                  </li>
                  {documentTrail(visible, current.id).map((d) => (
                    <li key={d.id}>
                      <span aria-hidden="true" className="mr-2">
                        /
                      </span>
                      {d.id === current.id ? (
                        <span aria-current="page">{d.title}</span>
                      ) : (
                        <Link
                          href={href(d)}
                          className="underline underline-offset-4"
                        >
                          {d.title}
                        </Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
              <article lang={locale} className="reading-document">
                <h1 className="mb-5 break-words font-[family-name:var(--font-display)] text-3xl tracking-tight md:text-4xl">
                  {title}
                </h1>
                {current.seoDescription ? (
                  <p className="mb-6 text-[var(--ink-muted)]">
                    {applyVariables(current.seoDescription, varMap)}
                  </p>
                ) : null}
                {current.hidden && internal ? (
                  <p className="mb-4 text-sm text-[var(--ink-muted)]">
                    Page masquée du portail public.
                  </p>
                ) : null}
                <details className="page-contents mb-6 xl:hidden">
                  <summary className="cursor-pointer py-2 font-medium">
                    Sur cette page
                  </summary>
                  <TocPanel content={content} />
                </details>
                <DocumentContent content={content} />
                {previous || next ? (
                  <nav
                    aria-label="Pages précédente et suivante"
                    className="mt-10 flex flex-wrap justify-between gap-4 border-t border-[var(--line)] pt-5"
                  >
                    {previous ? (
                      <Link
                        href={href(previous)}
                        aria-label={`Page précédente : ${previous.title}`}
                        className="page-step"
                      >
                        <span className="block text-sm text-[var(--ink-muted)]">
                          Page précédente
                        </span>
                        <span className="text-[var(--accent)] underline">
                          {previous.title}
                        </span>
                      </Link>
                    ) : (
                      <span />
                    )}
                    {next ? (
                      <Link
                        href={href(next)}
                        aria-label={`Page suivante : ${next.title}`}
                        className="page-step"
                      >
                        <span className="block text-sm text-[var(--ink-muted)]">
                          Page suivante
                        </span>
                        <span className="text-[var(--accent)] underline">
                          {next.title}
                        </span>
                      </Link>
                    ) : null}
                  </nav>
                ) : null}
              </article>
            </>
          ) : (
            <p>
              Aucune page dans la langue « {locale} ». Changez de langue pour
              consulter les documents disponibles.
            </p>
          )}
        </main>
        <div className="hidden w-56 shrink-0 xl:block">
          {content ? <TocPanel content={content} tags={current?.tags} /> : null}
        </div>
      </div>
      <Dialog
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title="Documents"
        className="navigation-dialog"
      >
        <nav id="portal-mobile-navigation" aria-label="Documents de l’espace">
          {navigation}
        </nav>
      </Dialog>
    </div>
  );
}
