"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DocumentContent } from "@/components/DocumentContent";
import { DocTree } from "@/components/DocTree";
import { TocPanel } from "@/components/TocPanel";
import {
  buildTree,
  findByPath,
  firstReadablePage,
  pathSlugs,
} from "@/lib/tree";
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
};

function mapNode(node: TipTapNode, vars: Record<string, string>): TipTapNode {
  const next: TipTapNode = { ...node };
  if (next.text) next.text = applyVariables(next.text, vars);
  if (next.content) next.content = next.content.map((c) => mapNode(c, vars));
  return next;
}

function substituteDoc(
  doc: TipTapDoc,
  vars: Record<string, string>,
): TipTapDoc {
  return {
    type: "doc",
    content: (doc.content ?? []).map((n) => mapNode(n, vars)),
  };
}

export function PortalView({
  space,
  versionSpaces,
  documents,
  variables,
  path,
  locale,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);

  const visible = documents.filter((d) => !d.hidden && d.locale === locale);
  const tree = useMemo(() => buildTree(visible), [visible]);

  const varMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of variables) m[v.key] = v.value;
    return m;
  }, [variables]);

  const current =
    (path.length ? findByPath(visible, path) : firstReadablePage(visible)) ??
    firstReadablePage(visible);

  const content = current ? substituteDoc(current.content, varMap) : null;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return visible
      .filter((d) => d.kind === "page")
      .filter((d) => {
        const tags = (d.tags ?? []).join(" ");
        const hay =
          `${d.title}\n${tags}\n${extractText(d.content)}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [query, visible]);

  function withQuery(href: string, next: { locale?: string }) {
    const url = new URL(href, "http://local");
    url.searchParams.set("lang", next.locale ?? locale);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]"
      style={
        {
          "--accent": space.accentColor,
          "--accent-soft": `${space.accentColor}22`,
        } as React.CSSProperties
      }
    >
      <header className="flex min-h-14 flex-wrap gap-3 py-3 items-center justify-between border-b border-[var(--line)] px-4 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="md:hidden"
            aria-expanded={navigationOpen}
            aria-controls="portal-navigation"
            onClick={() => setNavigationOpen(!navigationOpen)}
          >
            Sommaire
          </button>
          <Link
            href={withQuery(`/p/${space.slug}`, {})}
            className="font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            {space.name}
          </Link>
          <select
            aria-label="Version de la documentation"
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
            value={space.id}
            onChange={(e) => {
              const target = versionSpaces.find((s) => s.id === e.target.value);
              if (target) router.push(`/p/${target.slug}?lang=${locale}`);
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
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
            value={locale}
            onChange={(e) =>
              router.push(
                withQuery(`/p/${space.slug}`, { locale: e.target.value }),
              )
            }
          >
            {(space.locales ?? [locale]).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher dans la documentation"
            placeholder="Rechercher…"
            className="w-40 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm md:w-56"
          />
          <Link
            href="/app"
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Espace de rédaction
          </Link>
        </div>
      </header>

      {searchResults.length > 0 ? (
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-3">
          <ul className="mx-auto flex max-w-3xl flex-col gap-1">
            {searchResults.map((doc) => {
              const slugs = pathSlugs(visible, doc.id);
              return (
                <li key={doc.id}>
                  <Link
                    href={withQuery(`/p/${space.slug}/${slugs.join("/")}`, {})}
                    className="text-sm text-[var(--accent)] hover:underline"
                    onClick={() => setQuery("")}
                  >
                    {doc.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {query.trim() && searchResults.length === 0 ? (
        <p role="status" className="px-6 py-3 text-sm">
          Aucun résultat pour « {query} ».
        </p>
      ) : null}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
        <aside
          id="portal-navigation"
          className={`${navigationOpen ? "block" : "hidden"} w-full border-r border-[var(--line)] p-4 md:block md:w-60 md:shrink-0`}
        >
          <DocTree
            nodes={tree}
            activeId={current?.id}
            baseHref={(node) => {
              if (node.kind === "link" && node.href) return node.href;
              const slugs = pathSlugs(visible, node.id);
              return withQuery(`/p/${space.slug}/${slugs.join("/")}`, {});
            }}
          />
        </aside>

        <article className="min-w-0 flex-1 px-6 py-8 md:px-10">
          {current && content ? (
            <>
              <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl tracking-tight md:text-4xl">
                {applyVariables(current.seoTitle || current.title, varMap)}
              </h1>
              {current.seoDescription ? (
                <p className="mb-6 text-[var(--ink-muted)]">
                  {applyVariables(current.seoDescription, varMap)}
                </p>
              ) : null}
              <DocumentContent content={content} />
            </>
          ) : (
            <p className="text-[var(--ink-faint)]">
              Aucune page dans la langue « {locale} ». Changez de langue ou
              préparez une traduction dans l’espace de rédaction.
            </p>
          )}
        </article>

        <div className="hidden w-56 shrink-0 xl:block">
          {content ? <TocPanel content={content} tags={current?.tags} /> : null}
        </div>
      </div>
    </div>
  );
}
