"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { DocEditor } from "@/components/DocEditor";
import { DocTree } from "@/components/DocTree";
import { GitHubImportModal } from "@/components/GitHubImportModal";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { SidePanel } from "@/components/SidePanel";
import { hasUnpublishedChanges } from "@/lib/publish";
import { buildTree } from "@/lib/tree";
import { applyVariables } from "@/lib/tiptap-text";
import type {
  Comment,
  DocumentRecord,
  Integration,
  LlmSettings,
  Organization,
  Snippet,
  Space,
  Template,
  TipTapDoc,
  TipTapNode,
  Variable,
} from "@/lib/types";

type WorkspacePayload = {
  organization: Organization;
  space: Space;
  spaces: Space[];
  versionSpaces?: Space[];
  documents: DocumentRecord[];
  variables: Variable[];
  snippets: Snippet[];
  templates: Template[];
  integrations?: Integration[];
  comments: Comment[];
};

const DEFAULT_LLM: LlmSettings = {
  enabled: false,
  provider: "compatible",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

type Props = { initial: WorkspacePayload };

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

export function WorkspaceApp({ initial }: Props) {
  const [payload, setPayload] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(
    initial.documents.find((d) => d.kind === "page" && d.locale === (initial.space.defaultLocale ?? "en"))?.id ??
      initial.documents.find((d) => d.locale === (initial.space.defaultLocale ?? "en"))?.id ??
      null,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<{ document: DocumentRecord; snippet: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"space" | "org-llm" | "space-llm">(
    "space",
  );
  const [githubOpen, setGithubOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sideTab, setSideTab] = useState<"contents" | "comments" | "seo" | "ai">(
    "contents",
  );
  const [locale, setLocale] = useState(initial.space.defaultLocale ?? "en");
  const [mdFormat, setMdFormat] = useState<"auto" | "commonmark" | "gfm" | "mdx" | "obsidian">("auto");
  const [revisions, setRevisions] = useState<{ id: string; title: string; createdAt: string }[]>([]);
  const saveTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const localeDocs = useMemo(
    () => payload.documents.filter((d) => (d.locale || "en") === locale),
    [payload.documents, locale],
  );
  const active = localeDocs.find((d) => d.id === activeId) ?? null;
  const tree = useMemo(() => buildTree(localeDocs), [localeDocs]);
  const dirty = hasUnpublishedChanges(payload.space, payload.documents);
  const docComments = payload.comments.filter((c) => c.documentId === activeId);
  const versionSpaces =
    payload.versionSpaces ??
    payload.spaces.filter((s) => s.versionGroupId === payload.space.versionGroupId);

  const varMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of payload.variables) m[v.key] = v.value;
    return m;
  }, [payload.variables]);

  const reloadSpace = useCallback(async (spaceId: string) => {
    const res = await fetch(`/api/spaces/${spaceId}`);
    if (!res.ok) return;
    const data = (await res.json()) as WorkspacePayload;
    const nextLocale = data.space.defaultLocale ?? "en";
    setPayload({
      ...data,
      templates: data.templates ?? [],
      comments: data.comments ?? [],
      integrations: data.integrations ?? [],
      versionSpaces: data.versionSpaces ?? [],
    });
    setLocale(nextLocale);
    const docs = data.documents.filter((d) => (d.locale || "en") === nextLocale);
    setActiveId(docs.find((d) => d.kind === "page")?.id ?? docs[0]?.id ?? null);
    setPreview(false);
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/documents/${activeId}`).then((r) => r.json()),
      fetch(`/api/comments?documentId=${activeId}`).then((r) => r.json()),
    ]).then(([docData, commentData]) => {
      if (cancelled) return;
      setRevisions(docData.revisions ?? []);
      setPayload((prev) => ({
        ...prev,
        comments: [
          ...prev.comments.filter((c) => c.documentId !== activeId),
          ...(commentData.comments ?? []),
        ],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&spaceId=${payload.space.id}`,
      );
      const data = await res.json();
      setSearchHits(
        (data.results ?? [])
          .filter((r: { document: DocumentRecord }) => (r.document.locale || "en") === locale)
          .map((r: { document: DocumentRecord; snippet: string }) => ({
            document: r.document,
            snippet: r.snippet,
          })),
      );
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, payload.space.id, locale]);

  const persistContent = useCallback(
    async (documentId: string, content: TipTapDoc) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error("save failed");
        const data = await res.json();
        setPayload((prev) => ({
          ...prev,
          documents: prev.documents.map((d) => {
            if (d.id !== documentId) return d;
            // Keep local editor content; only refresh server metadata.
            return {
              ...data.document,
              content: d.content,
              title: d.title,
            };
          }),
        }));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [],
  );

  const onEditorChange = useCallback(
    (content: TipTapDoc) => {
      if (!active || preview) return;
      setPayload((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === active.id ? { ...d, content, updatedAt: new Date().toISOString() } : d,
        ),
      }));
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persistContent(active.id, content);
      }, 700);
    },
    [active, persistContent, preview],
  );

  async function patchActive(patch: Partial<DocumentRecord>) {
    if (!active) return;
    setPayload((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === active.id ? { ...d, ...patch } : d,
      ),
    }));
    const res = await fetch(`/api/documents/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.document) {
      setPayload((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === active.id ? data.document : d,
        ),
      }));
    }
  }

  async function createDoc(
    parentId: string | null,
    opts?: { title?: string; content?: TipTapDoc; kind?: DocumentRecord["kind"] },
  ) {
    const title = opts?.title ?? window.prompt("Titre du document", "Sans titre");
    if (!title?.trim()) return;
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: payload.space.id,
        title: title.trim(),
        parentId,
        kind: opts?.kind,
        content: opts?.content,
        locale,
      }),
    });
    const data = await res.json();
    setPayload((prev) => ({
      ...prev,
      documents: [...prev.documents, data.document],
    }));
    setActiveId(data.document.id);
    setToolsOpen(false);
  }

  async function publish() {
    const res = await fetch(`/api/spaces/${payload.space.id}/publish`, {
      method: "POST",
    });
    const data = await res.json();
    setPayload((prev) => ({ ...prev, space: data.space }));
  }

  async function saveSpaceSettings(patch: Partial<Space>) {
    const res = await fetch(`/api/spaces/${payload.space.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setPayload((prev) => ({ ...prev, space: data.space }));
    setSettingsOpen(false);
  }

  async function saveOrgLlm(llm: LlmSettings) {
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm }),
    });
    const data = await res.json();
    if (data.organization) {
      setPayload((prev) => ({ ...prev, organization: data.organization }));
    }
    setSettingsOpen(false);
  }

  function jumpToHeading(index: number) {
    const root = document.querySelector(".doc-editor");
    if (!root) return;
    const headings = root.querySelectorAll("h1, h2, h3");
    const el = headings[index] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function insertAiText(text: string) {
    if (!active || preview) return;
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const nodes: TipTapNode[] = paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    }));
    if (nodes.length === 0) return;
    const next: TipTapDoc = {
      type: "doc",
      content: [...(active.content.content ?? []), ...nodes],
    };
    onEditorChange(next);
  }

  const orgLlm = payload.organization.llm ?? DEFAULT_LLM;
  const spaceLlm = payload.space.llm;
  const llmEnabled = Boolean(
    (spaceLlm?.enabled && spaceLlm.apiKey) ||
      (orgLlm.enabled && orgLlm.apiKey) ||
      (spaceLlm?.apiKey && spaceLlm.apiKey.length > 0),
  );

  async function createSpace() {
    const name = window.prompt("Nom du Space");
    if (!name?.trim()) return;
    const res = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (data.space) await reloadSpace(data.space.id);
  }

  async function createVersion() {
    const label = window.prompt("Nom de version", "v1.0");
    if (!label?.trim()) return;
    const res = await fetch(`/api/spaces/${payload.space.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    });
    const data = await res.json();
    if (data.space) await reloadSpace(data.space.id);
  }

  async function createDocTranslation(targetLocale: string) {
    if (!active) return;
    const res = await fetch(`/api/documents/${active.id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: targetLocale }),
    });
    const data = await res.json();
    if (!data.document) return;
    setPayload((prev) => ({
      ...prev,
      documents: [...prev.documents, data.document],
    }));
    setLocale(targetLocale);
    setActiveId(data.document.id);
    setMenuOpen(false);
  }

  async function removeDoc() {
    if (!active) return;
    if (!window.confirm(`Supprimer « ${active.title} » et ses enfants ?`)) return;
    await fetch(`/api/documents/${active.id}`, { method: "DELETE" });
    await reloadSpace(payload.space.id);
  }

  async function restoreRev(revisionId: string) {
    if (!active) return;
    const res = await fetch(`/api/documents/${active.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId }),
    });
    const data = await res.json();
    if (data.document) {
      setPayload((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === active.id ? data.document : d,
        ),
      }));
      setMenuOpen(false);
    }
  }

  async function exportMarkdown() {
    if (!active) return;
    const res = await fetch(`/api/documents/${active.id}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  async function importMarkdownFile(file: File) {
    const markdown = await file.text();
    const res = await fetch("/api/documents/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: payload.space.id,
        title: file.name.replace(/\.(md|mdx|markdown)$/i, ""),
        markdown,
        format: mdFormat,
        locale,
      }),
    });
    const data = await res.json();
    setPayload((prev) => ({
      ...prev,
      documents: [...prev.documents, data.document],
    }));
    setActiveId(data.document.id);
    setToolsOpen(false);
  }

  async function onReorder(
    dragId: string,
    dropId: string,
    position: "before" | "after" | "inside",
  ) {
    const docs = [...payload.documents];
    const drag = docs.find((d) => d.id === dragId);
    const drop = docs.find((d) => d.id === dropId);
    if (!drag || !drop) return;
    const parentId = position === "inside" ? drop.id : drop.parentId;
    const siblings = docs
      .filter((d) => d.parentId === parentId && d.id !== dragId && d.locale === drag.locale)
      .sort((a, b) => a.position - b.position);
    let insertAt = siblings.findIndex((d) => d.id === dropId);
    if (position === "after") insertAt += 1;
    if (position === "inside") insertAt = siblings.length;
    if (insertAt < 0) insertAt = siblings.length;
    siblings.splice(insertAt, 0, { ...drag, parentId });
    const orderedIds = siblings.map((d) => d.id);
    const res = await fetch("/api/documents/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: payload.space.id,
        orderedIds,
        parentId,
      }),
    });
    const data = await res.json();
    setPayload((prev) => ({ ...prev, documents: data.documents }));
  }

  async function addComment(body: string) {
    if (!active) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: active.id, author: "Vous", body }),
    });
    const data = await res.json();
    setPayload((prev) => ({
      ...prev,
      comments: [data.comment, ...prev.comments],
    }));
  }

  async function toggleComment(id: string, resolved: boolean) {
    const res = await fetch("/api/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolved }),
    });
    const data = await res.json();
    setPayload((prev) => ({
      ...prev,
      comments: prev.comments.map((c) => (c.id === id ? data.comment : c)),
    }));
  }

  function insertSnippet(snippet: Snippet) {
    if (!active) return;
    const text = applyVariables(snippet.body, varMap);
    const content: TipTapDoc = {
      type: "doc",
      content: [
        ...(active.content.content ?? []),
        { type: "paragraph", content: [{ type: "text", text }] },
      ],
    };
    setPayload((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === active.id ? { ...d, content } : d,
      ),
    }));
    void persistContent(active.id, content);
  }

  const editorContent =
    active && preview ? substituteDoc(active.content, varMap) : active?.content;

  const saveLabel =
    saveState === "saving"
      ? "Enregistrement…"
      : saveState === "saved"
        ? "Enregistré"
        : saveState === "error"
          ? "Erreur d’enregistrement"
          : "Prêt";

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--line)] px-4">
        <Link href="/" className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          Documentalist
        </Link>
        <select
          className="max-w-[180px] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm"
          value={payload.space.id}
          onChange={(e) => void reloadSpace(e.target.value)}
          title="Choisir un Space"
        >
          {payload.spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
          value={payload.space.id}
          onChange={(e) => void reloadSpace(e.target.value)}
          title="Version documentaire"
        >
          {versionSpaces.map((s) => (
            <option key={s.id} value={s.id}>
              Version {s.versionLabel}
              {s.isMainVersion ? " · principale" : ""}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
          value={locale}
          onChange={(e) => {
            const next = e.target.value;
            setLocale(next);
            const docs = payload.documents.filter((d) => (d.locale || "en") === next);
            setActiveId(docs.find((d) => d.kind === "page")?.id ?? docs[0]?.id ?? null);
          }}
          title="Langue d’édition"
        >
          {(payload.space.locales ?? [locale]).map((l) => (
            <option key={l} value={l}>
              Langue {l}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--ink-faint)]">{saveLabel}</span>
          <span
            className={[
              "rounded-md px-2 py-0.5 text-[11px] font-medium",
              dirty
                ? "bg-[#8B691422] text-[#8B6914]"
                : "bg-[var(--accent-soft)] text-[var(--accent)]",
            ].join(" ")}
          >
            {dirty ? "Modifs non publiées" : "À jour"}
          </span>
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--surface-hover)]"
          >
            Outils
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--surface-hover)]"
          >
            Paramètres
          </button>
          {payload.space.publishedAt ? (
            <Link
              href={`/p/${payload.space.slug}?lang=${locale}`}
              className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--surface-hover)]"
              target="_blank"
            >
              Voir le site
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void publish()}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Publier
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
          <div className="space-y-2 border-b border-[var(--line)] p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            />
            {searchHits.length > 0 ? (
              <ul className="max-h-36 overflow-auto text-xs">
                {searchHits.map((hit) => (
                  <li key={hit.document.id}>
                    <button
                      type="button"
                      className="w-full rounded px-1 py-1 text-left hover:bg-[var(--surface-hover)]"
                      onClick={() => {
                        setActiveId(hit.document.id);
                        setQuery("");
                      }}
                    >
                      <div className="font-medium">{hit.document.title}</div>
                      <div className="truncate text-[var(--ink-faint)]">{hit.snippet}</div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                className="rounded-md bg-[var(--ink)] px-2 py-1.5 text-xs text-[var(--bg)]"
                onClick={() => void createDoc(null)}
              >
                + Page
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--line)] px-2 py-1.5 text-xs"
                onClick={() =>
                  void createDoc(null, { title: "Nouvelle catégorie", kind: "category" })
                }
              >
                + Catégorie
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2">
            <p className="mb-1 px-2 text-[10px] text-[var(--ink-faint)]">
              Glisser pour réordonner
            </p>
            {tree.length === 0 ? (
              <p className="px-2 text-sm text-[var(--ink-faint)]">
                Aucun document en « {locale} ». Créez une page ou changez de langue.
              </p>
            ) : (
              <DocTree
                nodes={tree}
                activeId={activeId}
                baseHref={() => "#"}
                linkMode="button"
                onSelect={(id) => {
                  setActiveId(id);
                  setPreview(false);
                }}
                onReorder={(a, b, pos) => void onReorder(a, b, pos)}
              />
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {active && editorContent ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full bg-transparent font-[family-name:var(--font-display)] text-2xl tracking-tight outline-none"
                    value={active.title}
                    disabled={preview}
                    onChange={(e) => {
                      const title = e.target.value;
                      setPayload((prev) => ({
                        ...prev,
                        documents: prev.documents.map((d) =>
                          d.id === active.id ? { ...d, title } : d,
                        ),
                      }));
                    }}
                    onBlur={() => void patchActive({ title: active.title })}
                  />
                  <p className="text-xs text-[var(--ink-faint)]">
                    {active.kind === "category" ? "Catégorie" : "Page"}
                    {active.hidden ? " · masquée du site" : ""}
                    {" · "}
                    {formatDistanceToNow(new Date(active.updatedAt), {
                      addSuffix: true,
                      locale: fr,
                    })}
                    {active.markdownFormat ? ` · ${active.markdownFormat}` : ""}
                  </p>
                </div>
                <div className="relative flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={[
                      "rounded-md border px-2.5 py-1 text-xs",
                      preview
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--line)]",
                    ].join(" ")}
                    onClick={() => setPreview((v) => !v)}
                  >
                    {preview ? "Revenir à l’édition" : "Aperçu"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--line)] px-2 py-1 text-xs"
                    onClick={() => void createDoc(active.id)}
                  >
                    Sous-page
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--line)] px-2 py-1 text-xs"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    Plus
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-9 z-30 max-h-80 w-56 overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] py-1 text-sm shadow-lg"
                    >
                      <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]" onClick={() => { void patchActive({ kind: "page" }); setMenuOpen(false); }}>Convertir en page</button>
                      <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]" onClick={() => { void patchActive({ kind: "category" }); setMenuOpen(false); }}>Convertir en catégorie</button>
                      <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]" onClick={() => { void patchActive({ hidden: !active.hidden }); setMenuOpen(false); }}>{active.hidden ? "Afficher sur le site" : "Masquer du site"}</button>
                      <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]" onClick={() => void exportMarkdown()}>Exporter Markdown</button>
                      {(payload.space.locales ?? []).filter((l) => l !== locale).map((l) => (
                        <button key={l} type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]" onClick={() => void createDocTranslation(l)}>Traduire en {l}</button>
                      ))}
                      <button type="button" className="block w-full px-3 py-1.5 text-left text-[#A32D2D] hover:bg-[var(--surface-hover)]" onClick={() => void removeDoc()}>Supprimer</button>
                      <div className="my-1 border-t border-[var(--line)]" />
                      <p className="px-3 py-1 text-[10px] uppercase text-[var(--ink-faint)]">Historique</p>
                      {revisions.slice(0, 8).map((r) => (
                        <button key={r.id} type="button" className="block w-full px-3 py-1 text-left text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-hover)]" onClick={() => void restoreRev(r.id)}>
                          Restaurer · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: fr })}
                        </button>
                      ))}
                      {revisions.length === 0 ? (
                        <div className="px-3 py-1 text-xs text-[var(--ink-faint)]">Aucune révision</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <DocEditor
                    key={active.id}
                    documentId={active.id}
                    content={editorContent}
                    editable={!preview}
                    showToolbar={!preview}
                    onChange={onEditorChange}
                  />
                </div>
                <div className="hidden w-[250px] shrink-0 lg:block">
                  <SidePanel
                    tab={sideTab}
                    onTabChange={setSideTab}
                    content={active.content}
                    document={active}
                    comments={docComments}
                    spaceId={payload.space.id}
                    llmEnabled={llmEnabled}
                    onAddComment={(body) => void addComment(body)}
                    onToggleComment={(id, resolved) => void toggleComment(id, resolved)}
                    onPatchDocument={(patch) => void patchActive(patch)}
                    onJumpToHeading={jumpToHeading}
                    onInsertAiText={insertAiText}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--ink-faint)]">
              <p>Sélectionnez une page ou créez-en une.</p>
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
                onClick={() => void createDoc(null)}
              >
                Créer une page
              </button>
            </div>
          )}
        </main>
      </div>

      <GitHubImportModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        onImported={(space) => void reloadSpace(space.id)}
      />

      {toolsOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-xl">Outils</h2>
              <button type="button" className="text-sm text-[var(--ink-muted)]" onClick={() => setToolsOpen(false)}>Fermer</button>
            </div>

            <section className="mb-5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">Importer</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => void createSpace()}>Nouveau Space</button>
                <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => setGithubOpen(true)}>Depuis GitHub</button>
                <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => fileRef.current?.click()}>Fichier Markdown</button>
                <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => void createVersion()}>Snapshot de version</button>
              </div>
              <label className="block text-xs text-[var(--ink-muted)]">
                Format Markdown à l’import
                <select
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                  value={mdFormat}
                  onChange={(e) => setMdFormat(e.target.value as typeof mdFormat)}
                >
                  <option value="auto">Auto-détection</option>
                  <option value="commonmark">CommonMark</option>
                  <option value="gfm">GFM (tables, tâches)</option>
                  <option value="mdx">MDX</option>
                  <option value="obsidian">Obsidian</option>
                </select>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.mdx,.markdown,text/markdown"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importMarkdownFile(file);
                  e.target.value = "";
                }}
              />
            </section>

            <section className="mb-5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">Modèles</h3>
              {(payload.templates ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="mb-1 block w-full rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                  onClick={() => void createDoc(null, { title: t.name, content: structuredClone(t.content) })}
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-[var(--ink-faint)]">{t.description}</div>
                </button>
              ))}
            </section>

            <section className="mb-5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">Extraits réutilisables</h3>
              <div className="space-y-1 text-xs text-[var(--ink-muted)]">
                {payload.variables.map((v) => (
                  <div key={v.id} className="flex justify-between gap-2 rounded border border-[var(--line)] px-2 py-1">
                    <code>{`{{${v.key}}}`}</code>
                    <span className="truncate">{v.value}</span>
                  </div>
                ))}
              </div>
              {payload.snippets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    insertSnippet(s);
                    setToolsOpen(false);
                  }}
                >
                  Insérer : {s.name}
                </button>
              ))}
            </section>

            <IntegrationsPanel
              integrations={payload.integrations ?? []}
              spaceId={payload.space.id}
              onChange={(integrations) => setPayload((prev) => ({ ...prev, integrations }))}
              onOpenGithubImport={() => {
                setToolsOpen(false);
                setGithubOpen(true);
              }}
            />
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-xl">Paramètres</h2>
              <button type="button" className="text-sm text-[var(--ink-muted)]" onClick={() => setSettingsOpen(false)}>Fermer</button>
            </div>
            <div className="mb-4 flex gap-1 border-b border-[var(--line)] text-xs font-medium">
              {(
                [
                  ["space", "Space"],
                  ["org-llm", "IA (org)"],
                  ["space-llm", "IA (Space)"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={[
                    "px-3 py-2",
                    settingsTab === id
                      ? "border-b-2 border-[var(--accent)] text-[var(--ink)]"
                      : "text-[var(--ink-faint)]",
                  ].join(" ")}
                  onClick={() => setSettingsTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {settingsTab === "space" ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const locales = String(fd.get("locales") ?? "en")
                    .split(/[,\s]+/)
                    .map((x) => x.trim())
                    .filter(Boolean);
                  void saveSpaceSettings({
                    name: String(fd.get("name") ?? ""),
                    description: String(fd.get("description") ?? ""),
                    accentColor: String(fd.get("accentColor") ?? "#0F6E56"),
                    accessPassword: String(fd.get("accessPassword") ?? "") || null,
                    customCss: String(fd.get("customCss") ?? ""),
                    isPublic: fd.get("isPublic") === "on",
                    defaultLocale: String(fd.get("defaultLocale") ?? "en"),
                    locales: locales.length ? locales : ["en"],
                    versionLabel: String(fd.get("versionLabel") ?? "current"),
                  });
                }}
              >
                <label className="text-sm">Nom<input name="name" defaultValue={payload.space.name} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <label className="text-sm">Description<input name="description" defaultValue={payload.space.description} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <label className="text-sm">Libellé de version<input name="versionLabel" defaultValue={payload.space.versionLabel ?? "current"} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">Langue par défaut<input name="defaultLocale" defaultValue={payload.space.defaultLocale ?? "en"} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                  <label className="text-sm">Langues<input name="locales" defaultValue={(payload.space.locales ?? ["en", "fr"]).join(", ")} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                </div>
                <label className="text-sm">Couleur<input name="accentColor" type="color" defaultValue={payload.space.accentColor} className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-[var(--bg)]" /></label>
                <label className="text-sm">Mot de passe du site<input name="accessPassword" type="password" defaultValue={payload.space.accessPassword ?? ""} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <label className="text-sm">CSS personnalisé<textarea name="customCss" rows={3} defaultValue={payload.space.customCss ?? ""} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs" /></label>
                <label className="flex items-center gap-2 text-sm"><input name="isPublic" type="checkbox" defaultChecked={payload.space.isPublic} />Public</label>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => setSettingsOpen(false)}>Annuler</button>
                  <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white">Enregistrer</button>
                </div>
              </form>
            ) : null}

            {settingsTab === "org-llm" ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  void saveOrgLlm({
                    enabled: fd.get("enabled") === "on",
                    provider: String(fd.get("provider") ?? "compatible") as LlmSettings["provider"],
                    apiKey: String(fd.get("apiKey") ?? ""),
                    baseUrl: String(fd.get("baseUrl") ?? ""),
                    model: String(fd.get("model") ?? ""),
                  });
                }}
              >
                <p className="text-xs text-[var(--ink-muted)]">
                  Configuration LLM par défaut pour toute l’organisation (OpenAI, Anthropic, Ollama, etc.).
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input name="enabled" type="checkbox" defaultChecked={orgLlm.enabled} />
                  Activer l’assistant IA
                </label>
                <label className="text-sm">
                  Fournisseur
                  <select name="provider" defaultValue={orgLlm.provider} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5">
                    <option value="compatible">OpenAI-compatible</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label className="text-sm">Clé API<input name="apiKey" type="password" defaultValue={orgLlm.apiKey} placeholder="sk-… / ghp_…" className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <label className="text-sm">Base URL<input name="baseUrl" defaultValue={orgLlm.baseUrl} placeholder="https://api.openai.com/v1" className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs" /></label>
                <label className="text-sm">Modèle<input name="model" defaultValue={orgLlm.model} placeholder="gpt-4o-mini" className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => setSettingsOpen(false)}>Annuler</button>
                  <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white">Enregistrer</button>
                </div>
              </form>
            ) : null}

            {settingsTab === "space-llm" ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const useOverride = fd.get("override") === "on";
                  if (!useOverride) {
                    void saveSpaceSettings({ llm: null });
                    return;
                  }
                  void saveSpaceSettings({
                    llm: {
                      enabled: fd.get("enabled") === "on",
                      provider: String(fd.get("provider") ?? "compatible") as LlmSettings["provider"],
                      apiKey: String(fd.get("apiKey") ?? ""),
                      baseUrl: String(fd.get("baseUrl") ?? ""),
                      model: String(fd.get("model") ?? ""),
                    },
                  });
                }}
              >
                <p className="text-xs text-[var(--ink-muted)]">
                  Surcharge optionnelle pour ce Space. Sinon, l’IA organisationnelle est utilisée.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input name="override" type="checkbox" defaultChecked={Boolean(spaceLlm)} />
                  Utiliser une config dédiée à ce Space
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input name="enabled" type="checkbox" defaultChecked={spaceLlm?.enabled ?? false} />
                  Activer pour ce Space
                </label>
                <label className="text-sm">
                  Fournisseur
                  <select name="provider" defaultValue={spaceLlm?.provider ?? orgLlm.provider} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5">
                    <option value="compatible">OpenAI-compatible</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label className="text-sm">Clé API<input name="apiKey" type="password" defaultValue={spaceLlm?.apiKey ?? ""} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <label className="text-sm">Base URL<input name="baseUrl" defaultValue={spaceLlm?.baseUrl ?? orgLlm.baseUrl} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs" /></label>
                <label className="text-sm">Modèle<input name="model" defaultValue={spaceLlm?.model ?? orgLlm.model} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => setSettingsOpen(false)}>Annuler</button>
                  <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white">Enregistrer</button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
