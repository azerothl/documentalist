"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DocEditor } from "@/components/DocEditor";
import { DocTree } from "@/components/DocTree";
import { TocPanel } from "@/components/TocPanel";
import { buildTree, findByPath, firstReadablePage, pathSlugs } from "@/lib/tree";
import { applyVariables, extractText } from "@/lib/tiptap-text";
import type {
  DocumentRecord,
  Space,
  TipTapDoc,
  TipTapNode,
  Variable,
} from "@/lib/types";

type Props = {
  space: Space;
  versionSpaces: Space[];
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

function substituteDoc(doc: TipTapDoc, vars: Record<string, string>): TipTapDoc {
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
  const storageKey = `documentalist.portal.${space.slug}`;
  const [unlocked, setUnlocked] = useState(!space.accessPassword);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!space.accessPassword) {
      setUnlocked(true);
      return;
    }
    try {
      setUnlocked(sessionStorage.getItem(storageKey) === "1");
    } catch {
      setUnlocked(false);
    }
  }, [space.accessPassword, storageKey]);

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
        const hay = `${d.title}\n${tags}\n${extractText(d.content)}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [query, visible]);

  function withQuery(href: string, next: { locale?: string }) {
    const url = new URL(href, "http://local");
    url.searchParams.set("lang", next.locale ?? locale);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-4">
        <form
          className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (password === space.accessPassword) {
              try {
                sessionStorage.setItem(storageKey, "1");
              } catch {
                /* ignore */
              }
              setUnlocked(true);
              setError("");
            } else {
              setError("Incorrect password");
            }
          }}
        >
          <h1 className="font-[family-name:var(--font-display)] text-2xl">
            {space.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            This portal is password-protected.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-4 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
            placeholder="Password"
            autoFocus
          />
          {error ? (
            <p className="mt-2 text-sm text-[#A32D2D]">{error}</p>
          ) : null}
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-[var(--accent)] py-2 text-sm font-medium text-white"
          >
            Unlock
          </button>
        </form>
      </div>
    );
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
      {space.customCss ? (
        <style dangerouslySetInnerHTML={{ __html: space.customCss }} />
      ) : null}
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={withQuery(`/p/${space.slug}`, {})}
            className="font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            {space.name}
          </Link>
          <select
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
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
            value={locale}
            onChange={(e) =>
              router.push(withQuery(`/p/${space.slug}`, { locale: e.target.value }))
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
            placeholder="Search docs…"
            className="w-40 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm md:w-56"
          />
          <Link
            href="/app"
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Edit in app
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
                    href={withQuery(
                      `/p/${space.slug}/${slugs.join("/")}`,
                      {},
                    )}
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

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-[var(--line)] p-4 md:block">
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
              <DocEditor
                documentId={current.id}
                content={content}
                editable={false}
              />
            </>
          ) : (
            <p className="text-[var(--ink-faint)]">
              No pages for locale “{locale}”. Switch language or translate docs
              in the workspace.
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
