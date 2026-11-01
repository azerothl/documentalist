"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { DocEditor } from "@/components/DocEditor";
import { DocTree } from "@/components/DocTree";
import { GitHubImportModal } from "@/components/GitHubImportModal";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { LlmSettingsFields } from "@/components/LlmSettingsFields";
import { SpaceSyncPanel } from "@/components/SpaceSyncPanel";
import { SidePanel } from "@/components/SidePanel";
import {
  AccountNavigation,
  type AccountIdentity,
} from "@/components/AccountNavigation";
import { TabList } from "@/components/TabList";
import { Dialog } from "@/components/Dialog";
import { useAppearance } from "@/components/Appearance";
import { accentStyle } from "@/lib/appearance";
import { documentTrail } from "@/lib/reading";
import { hasUnpublishedChanges } from "@/lib/publish";
import { apiFetch as fetch } from "@/lib/client-request";
import { getLlmProvider } from "@/lib/llm-providers";
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

const openaiDefaults = getLlmProvider("openai");
const DEFAULT_LLM: LlmSettings = {
  enabled: false,
  provider: "openai",
  apiKey: "",
  baseUrl: openaiDefaults.defaultBaseUrl,
  model: openaiDefaults.defaultModel,
};

function llmFromForm(fd: FormData): LlmSettings {
  return {
    enabled: fd.get("enabled") === "on",
    provider: String(fd.get("provider") ?? "openai") as LlmSettings["provider"],
    apiKey: String(fd.get("apiKey") ?? ""),
    baseUrl: String(fd.get("baseUrl") ?? ""),
    model: String(fd.get("model") ?? ""),
  };
}

type Props = {
  initial: WorkspacePayload;
  isAdmin: boolean;
  account: AccountIdentity;
  initialDocumentId?: string;
  initialLocale?: string;
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

export function WorkspaceApp({
  initial,
  isAdmin,
  account,
  initialDocumentId,
  initialLocale,
}: Props) {
  const { preferences, theme, update: updateAppearance } = useAppearance();
  const readingMode = preferences.readingMode;
  const [payload, setPayload] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(
    initialDocumentId ??
      initial.documents.find(
        (d) =>
          d.kind === "page" &&
          d.locale === (initialLocale ?? initial.space.defaultLocale ?? "en"),
      )?.id ??
      initial.documents.find(
        (d) =>
          d.locale === (initialLocale ?? initial.space.defaultLocale ?? "en"),
      )?.id ??
      null,
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [searchHits, setSearchHits] = useState<
    { document: DocumentRecord; snippet: string }[]
  >([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "space" | "org-llm" | "space-llm"
  >("space");
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubPreferCurrent, setGithubPreferCurrent] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sideTab, setSideTab] = useState<
    "contents" | "comments" | "seo" | "ai"
  >("contents");
  const [aiExpanded, setAiExpanded] = useState(false);
  const [locale, setLocale] = useState(
    initialLocale ?? initial.space.defaultLocale ?? "en",
  );
  const [mdFormat, setMdFormat] = useState<
    "auto" | "commonmark" | "gfm" | "mdx" | "obsidian"
  >("auto");
  const [revisions, setRevisions] = useState<
    { id: string; title: string; createdAt: string }[]
  >([]);
  const saveTimers = useRef(new Map<string, number>());
  const pendingSaves = useRef(new Map<string, TipTapDoc>());
  const saveChain = useRef(Promise.resolve(true));
  const documentVersions = useRef(
    new Map(initial.documents.map((d) => [d.id, d.updatedAt])),
  );
  const [notice, setNotice] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [pagePanelOpen, setPagePanelOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("root");
  const [movePosition, setMovePosition] = useState<
    "before" | "after" | "inside"
  >("after");
  const [moving, setMoving] = useState(false);
  const [operationStatus, setOperationStatus] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function selectDocument(id: string) {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      space: payload.space.id,
      doc: id,
      lang: locale,
    }).toString();
    if (url.href !== window.location.href)
      window.history.pushState(null, "", url);
    setActiveId(id);
    setPreview(false);
    setNavigationOpen(false);
    setMenuOpen(false);
    if (navigationOpen)
      window.requestAnimationFrame(() =>
        document.getElementById("main-content")?.focus(),
      );
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      space: payload.space.id,
      ...(activeId ? { doc: activeId } : {}),
      lang: locale,
    }).toString();
    window.history.replaceState(null, "", url);
  }, [activeId, payload.space.id, locale]);
  useEffect(() => {
    const restore = () => window.location.reload();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      )
        setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  const localeDocs = useMemo(
    () => payload.documents.filter((d) => (d.locale || "en") === locale),
    [payload.documents, locale],
  );
  const active = localeDocs.find((d) => d.id === activeId) ?? null;
  useEffect(() => {
    document.title = `${active?.title ?? "Documentation"} — ${payload.space.name} — Documentalist`;
  }, [active?.title, payload.space.name]);
  const tree = useMemo(() => buildTree(localeDocs), [localeDocs]);
  const dirty = hasUnpublishedChanges(payload.space, payload.documents);
  const docComments = payload.comments.filter((c) => c.documentId === activeId);
  const versionSpaces =
    payload.versionSpaces ??
    payload.spaces.filter(
      (s) => s.versionGroupId === payload.space.versionGroupId,
    );

  const varMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of payload.variables) m[v.key] = v.value;
    return m;
  }, [payload.variables]);

  async function reloadSpace(spaceId: string) {
    await flushPending();
    const res = await fetch(`/api/spaces/${spaceId}`);
    if (!res.ok) return;
    const data = (await res.json()) as WorkspacePayload;
    documentVersions.current = new Map(
      data.documents.map((d) => [d.id, d.updatedAt]),
    );
    const nextLocale = data.space.defaultLocale ?? "en";
    setPayload({
      ...data,
      templates: data.templates ?? [],
      comments: data.comments ?? [],
      integrations: data.integrations ?? [],
      versionSpaces: data.versionSpaces ?? [],
    });
    setLocale(nextLocale);
    const docs = data.documents.filter(
      (d) => (d.locale || "en") === nextLocale,
    );
    setActiveId(docs.find((d) => d.kind === "page")?.id ?? docs[0]?.id ?? null);
    setPreview(false);
    setMenuOpen(false);
  }

  async function syncSpaceImport(options?: {
    force?: boolean;
    quiet?: boolean;
    spaceId?: string;
  }) {
    const force = options?.force !== false;
    const quiet = options?.quiet === true;
    if (account.role === "viewer") return;
    const spaceId = options?.spaceId ?? payload.space.id;
    setSyncBusy(true);
    try {
      const res = await fetch("/api/spaces/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync échouée");
      if (data.skippedReason) {
        if (!quiet) setOperationStatus(data.skippedReason);
        if (data.space) {
          setPayload((prev) => ({
            ...prev,
            space: { ...prev.space, ...data.space },
          }));
        }
        return;
      }
      await reloadSpace(spaceId);
      if (!quiet) {
        const parts = [
          `${data.imported ?? 0} ajoutée(s)`,
          `${data.updated ?? 0} mise(s) à jour`,
        ];
        if (data.removed) parts.push(`${data.removed} retirée(s)`);
        setOperationStatus(`Synchronisation : ${parts.join(" · ")}`);
      }
    } catch (e) {
      if (!quiet) {
        setNotice(e instanceof Error ? e.message : "Sync échouée");
      }
      throw e;
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    if (account.role === "viewer") return;
    if (!payload.space.importSource?.autoSync) return;
    const spaceId = payload.space.id;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/spaces/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, force: false }),
        });
        const data = await res.json();
        if (cancelled || !res.ok || data.skippedReason) return;
        await reloadSpace(spaceId);
      } catch {
        /* lastSyncError is persisted server-side */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Auto-sync once when opening / switching Spaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- space.id only
  }, [payload.space.id, account.role]);

  useEffect(() => {
    if (account.role === "viewer") return;
    const source = payload.space.importSource;
    if (!source?.autoSync) return;
    const spaceId = payload.space.id;
    const tickMs = Math.max(
      60_000,
      Math.floor(source.syncIntervalMinutes / 2) * 60_000,
    );
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/spaces/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spaceId, force: false }),
          });
          const data = await res.json();
          if (!res.ok || data.skippedReason) return;
          await reloadSpace(spaceId);
        } catch {
          /* ignore background failures */
        }
      })();
    }, tickMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interval keyed by space + settings
  }, [
    payload.space.id,
    payload.space.importSource?.autoSync,
    payload.space.importSource?.syncIntervalMinutes,
    account.role,
  ]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/documents/${activeId}`).then((r) => r.json()),
      fetch(`/api/comments?documentId=${activeId}`).then((r) => r.json()),
    ]).then(([docData, commentData]) => {
      if (cancelled) return;
      if (docData.document)
        documentVersions.current.set(activeId, docData.document.updatedAt);
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
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      if (!query.trim()) {
        setSearchHits([]);
        setSearchState("idle");
        return;
      }
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&spaceId=${payload.space.id}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        setSearchHits(
          (data.results ?? [])
            .filter(
              (r: { document: DocumentRecord }) =>
                (r.document.locale || "en") === locale,
            )
            .map((r: { document: DocumentRecord; snippet: string }) => ({
              document: r.document,
              snippet: r.snippet,
            })),
        );
        setSearchState("done");
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchState("error");
          setNotice(
            error instanceof Error ? error.message : "Recherche impossible.",
          );
        }
      }
    }, 200);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query, payload.space.id, locale]);

  const persistContent = useCallback(
    (documentId: string, content: TipTapDoc) => {
      if (!pendingSaves.current.has(documentId))
        pendingSaves.current.set(documentId, content);
      const save = async () => {
        setSaveState("saving");
        try {
          const res = await fetch(`/api/documents/${documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              expectedUpdatedAt: documentVersions.current.get(documentId),
            }),
          });
          if (!res.ok) throw new Error("save failed");
          const data = await res.json();
          documentVersions.current.set(documentId, data.document.updatedAt);
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
          if (pendingSaves.current.get(documentId) === content)
            pendingSaves.current.delete(documentId);
          setSaveState(pendingSaves.current.size ? "saving" : "saved");
          return true;
        } catch {
          setSaveState("error");
          return false;
        }
      };
      saveChain.current = saveChain.current.then(save, save);
      return saveChain.current;
    },
    [],
  );

  const onEditorChange = useCallback(
    (content: TipTapDoc) => {
      if (!active || preview || readingMode) return;
      setPayload((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === active.id
            ? { ...d, content, updatedAt: new Date().toISOString() }
            : d,
        ),
      }));
      pendingSaves.current.set(active.id, content);
      setSaveState("saving");
      window.clearTimeout(saveTimers.current.get(active.id));
      saveTimers.current.set(
        active.id,
        window.setTimeout(() => {
          void persistContent(active.id, content);
        }, 700),
      );
    },
    [active, persistContent, preview, readingMode],
  );

  const flushPending = useCallback(async () => {
    for (const timer of saveTimers.current.values()) window.clearTimeout(timer);
    for (const [id, content] of pendingSaves.current)
      if (!(await persistContent(id, content)))
        throw new Error("La sauvegarde a échoué. Réessayez avant de publier.");
    await saveChain.current;
  }, [persistContent]);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSaves.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const error = (e: Event) => setNotice((e as CustomEvent<string>).detail);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("documentalist-error", error);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("documentalist-error", error);
    };
  }, []);
  useEffect(
    () => () => {
      void flushPending().catch(() => {});
    },
    [activeId, flushPending],
  );

  async function patchActive(patch: Partial<DocumentRecord>) {
    if (!active) return;
    setPayload((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === active.id ? { ...d, ...patch } : d,
      ),
    }));
    await flushPending();
    const save = async () => {
      try {
        const res = await fetch(`/api/documents/${active.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...patch,
            expectedUpdatedAt: documentVersions.current.get(active.id),
          }),
        });
        const data = await res.json();
        documentVersions.current.set(active.id, data.document.updatedAt);
        if (data.document) {
          setPayload((prev) => ({
            ...prev,
            documents: prev.documents.map((d) =>
              d.id === active.id
                ? { ...data.document, ...d, updatedAt: data.document.updatedAt }
                : d,
            ),
          }));
        }
        return true;
      } catch {
        return false;
      }
    };
    saveChain.current = saveChain.current.then(save, save);
    await saveChain.current;
  }

  async function createDoc(
    parentId: string | null,
    opts?: {
      title?: string;
      content?: TipTapDoc;
      kind?: DocumentRecord["kind"];
    },
  ) {
    const title =
      opts?.title ?? window.prompt("Titre du document", "Sans titre");
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
    documentVersions.current.set(data.document.id, data.document.updatedAt);
    setActiveId(data.document.id);
    setToolsOpen(false);
    setNavigationOpen(false);
  }

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    try {
      await flushPending();
      const res = await fetch(`/api/spaces/${payload.space.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      setPayload((prev) => ({ ...prev, space: data.space }));
      setOperationStatus(
        "Publication réussie. La nouvelle version est disponible sur le portail.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Publication impossible. Réessayez.",
      );
    } finally {
      setPublishing(false);
    }
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
    setPagePanelOpen(false);
    window.requestAnimationFrame(() => {
      el?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      el?.setAttribute("tabindex", "-1");
      el?.focus({ preventScroll: true });
    });
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
  const activeLlm = spaceLlm?.enabled ? spaceLlm : orgLlm;
  const activeProvider = getLlmProvider(activeLlm.provider);
  const llmEnabled = Boolean(
    activeLlm.enabled &&
    (activeProvider.apiKeyRequired ? Boolean(activeLlm.apiKey.trim()) : true) &&
    Boolean(activeLlm.model.trim() || activeProvider.defaultModel),
  );

  async function createSpace() {
    const name = window.prompt("Nom de l’espace");
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
    await flushPending();
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
    await flushPending();
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
    documentVersions.current.set(data.document.id, data.document.updatedAt);
    setActiveId(data.document.id);
    setMenuOpen(false);
  }

  async function removeDoc() {
    if (!active) return;
    if (!window.confirm(`Supprimer « ${active.title} » et ses enfants ?`))
      return;
    await flushPending();
    await fetch(`/api/documents/${active.id}`, { method: "DELETE" });
    await reloadSpace(payload.space.id);
  }

  async function restoreRev(revisionId: string) {
    if (!active) return;
    await flushPending();
    const res = await fetch(`/api/documents/${active.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId }),
    });
    const data = await res.json();
    if (data.document) {
      documentVersions.current.set(active.id, data.document.updatedAt);
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
    await flushPending();
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
    documentVersions.current.set(data.document.id, data.document.updatedAt);
    setActiveId(data.document.id);
    setToolsOpen(false);
  }

  async function onReorder(
    dragId: string,
    dropId: string,
    position: "before" | "after" | "inside",
  ) {
    await flushPending();
    const docs = [...payload.documents];
    const drag = docs.find((d) => d.id === dragId);
    const drop = docs.find((d) => d.id === dropId);
    if (!drag || (!drop && dropId !== "root")) return;
    const parentId =
      dropId === "root"
        ? null
        : position === "inside"
          ? drop!.id
          : drop!.parentId;
    const siblings = docs
      .filter(
        (d) =>
          d.parentId === parentId &&
          d.id !== dragId &&
          d.locale === drag.locale,
      )
      .sort((a, b) => a.position - b.position);
    let insertAt = siblings.findIndex((d) => d.id === dropId);
    if (position === "after") insertAt += 1;
    if (position === "inside") insertAt = siblings.length;
    if (dropId === "root") insertAt = siblings.length;
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
    documentVersions.current = new Map(
      data.documents.map((d: DocumentRecord) => [d.id, d.updatedAt]),
    );
    setPayload((prev) => ({ ...prev, documents: data.documents }));
    setOperationStatus(`« ${drag.title} » a été déplacé.`);
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
      ? "Enregistrement du brouillon…"
      : saveState === "saved"
        ? "Brouillon enregistré"
        : saveState === "error"
          ? "Erreur d’enregistrement"
          : "Brouillon prêt";

  const workspaceTools = (
    <>
      {account.role !== "viewer" ? (
        payload.space.importSource ? (
          <button
            type="button"
            className="secondary-button"
            disabled={syncBusy}
            title={
              payload.space.importSource.lastSyncError
                ? payload.space.importSource.lastSyncError
                : `Source ${payload.space.importSource.provider}`
            }
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              void syncSpaceImport({ force: true }).catch(() => undefined);
            }}
          >
            {syncBusy ? "Sync…" : "Relancer sync"}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              setToolsOpen(true);
            }}
          >
            Configurer sync
          </button>
        )
      ) : null}
      <button
        type="button"
        className="secondary-button"
        onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          setToolsOpen(true);
        }}
        aria-haspopup="dialog"
      >
        Outils
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={!isAdmin}
        title={!isAdmin ? "Réservé aux administrateurs" : undefined}
        onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          setSettingsOpen(true);
        }}
        aria-haspopup="dialog"
      >
        Paramètres
      </button>
      {payload.space.publishedAt ? (
        <Link
          href={`/p/${payload.space.slug}?lang=${locale}`}
          className="secondary-button"
          target="_blank"
          rel="noreferrer"
        >
          Voir le site<span className="sr-only"> (nouvel onglet)</span>
        </Link>
      ) : null}
    </>
  );

  const navigationContent = (
    <>
      <div className="space-y-2 border-b border-[var(--line)] p-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchState(e.target.value.trim() ? "loading" : "idle");
            setSearchHits([]);
          }}
          aria-label="Rechercher dans cet espace"
          type="search"
          placeholder="Rechercher…"
          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        />
        {query.trim() ? (
          <p role="status" className="text-sm text-[var(--ink-muted)]">
            {searchState === "loading"
              ? "Recherche…"
              : searchState === "error"
                ? "Recherche impossible. Réessayez."
                : searchHits.length
                  ? `${searchHits.length} résultat${searchHits.length > 1 ? "s" : ""}`
                  : `Aucun résultat pour « ${query} ».`}
          </p>
        ) : null}
        {searchHits.length > 0 ? (
          <ul className="max-h-64 overflow-auto text-sm">
            {searchHits.map((hit) => (
              <li key={hit.document.id}>
                <button
                  type="button"
                  className="w-full rounded px-1 py-1 text-left hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    selectDocument(hit.document.id);
                    setQuery("");
                  }}
                >
                  <div className="font-medium">{hit.document.title}</div>
                  <div className="text-sm text-[var(--ink-muted)]">
                    {documentTrail(localeDocs, hit.document.id)
                      .map((d) => d.title)
                      .join(" / ")}
                  </div>
                  <div className="line-clamp-2 text-[var(--ink-muted)]">
                    {hit.snippet}
                  </div>
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
              void createDoc(null, {
                title: "Nouvelle catégorie",
                kind: "category",
              })
            }
          >
            + Catégorie
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <p className="mb-1 px-2 text-[10px] text-[var(--ink-faint)]">
          Classement : glisser ou Plus → Déplacer
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
            onSelect={selectDocument}
            onReorder={(a, b, pos) => void onReorder(a, b, pos)}
          />
        )}
      </div>
    </>
  );
  const sidePanelContent = active ? (
    <SidePanel
      tab={sideTab}
      onTabChange={(tab) => {
        setSideTab(tab);
        if (tab !== "ai") setAiExpanded(false);
      }}
      content={active.content}
      document={active}
      comments={docComments}
      spaceId={payload.space.id}
      spaceName={payload.space.name}
      llmEnabled={llmEnabled}
      aiExpanded={aiExpanded}
      onAiExpandedChange={setAiExpanded}
      onAddComment={(body) => void addComment(body)}
      onToggleComment={(id, resolved) => void toggleComment(id, resolved)}
      onPatchDocument={(patch) => void patchActive(patch)}
      onJumpToHeading={jumpToHeading}
      onInsertAiText={insertAiText}
    />
  ) : null;

  return (
    <div
      className="workspace-shell flex min-h-0 flex-1 flex-col bg-[var(--bg)] text-[var(--ink)]"
      style={accentStyle(payload.space.accentColor, theme)}
    >
      {notice ? (
        <div
          role="alert"
          className="flex items-center gap-3 bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]"
        >
          {notice}
          <button onClick={() => setNotice("")}>Fermer</button>
          {saveState === "error" ? (
            <button
              onClick={() =>
                void flushPending().catch((e) => setNotice(e.message))
              }
            >
              Réessayer la sauvegarde
            </button>
          ) : null}
        </div>
      ) : null}
      <header className="workspace-header shrink-0 border-b border-[var(--line)]">
        <div className="workspace-header-main">
          <div className="workspace-context flex min-w-0 flex-wrap items-center gap-2">
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
              href="/"
              className="mr-2 font-[family-name:var(--font-display)] text-lg tracking-tight"
            >
              Documentalist
            </Link>
            <select
              aria-label="Espace de documentation"
              className="workspace-select"
              value={payload.space.id}
              onChange={(e) => void reloadSpace(e.target.value)}
            >
              {payload.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Version documentaire"
              className="workspace-select"
              value={payload.space.id}
              onChange={(e) => void reloadSpace(e.target.value)}
            >
              {versionSpaces.map((s) => (
                <option key={s.id} value={s.id}>
                  Version {s.versionLabel}
                  {s.isMainVersion ? " · principale" : ""}
                </option>
              ))}
            </select>
            <select
              aria-label="Langue d’édition"
              className="workspace-select"
              value={locale}
              onChange={(e) => {
                const next = e.target.value;
                setLocale(next);
                const docs = payload.documents.filter(
                  (d) => (d.locale || "en") === next,
                );
                setActiveId(
                  docs.find((d) => d.kind === "page")?.id ??
                    docs[0]?.id ??
                    null,
                );
              }}
            >
              {payload.space.locales.map((l) => (
                <option key={l} value={l}>
                  Langue {l}
                </option>
              ))}
            </select>
          </div>
          <AccountNavigation user={account} />
        </div>
        <div className="workspace-header-actions flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div
            role="status"
            aria-atomic="true"
            className="flex flex-wrap gap-x-3 gap-y-1 text-sm"
          >
            <span className="text-[var(--ink-muted)]">{saveLabel}</span>
            <span
              className={
                dirty
                  ? "font-medium text-[var(--warning)]"
                  : "text-[var(--ink-muted)]"
              }
            >
              {dirty
                ? "Modifications à publier"
                : payload.space.publishedAt
                  ? "Version publiée à jour"
                  : "Espace non publié"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              {workspaceTools}
            </div>
            <details className="relative md:hidden">
              <summary className="secondary-button">Actions</summary>
              <div className="absolute right-0 top-full z-30 mt-2 flex min-w-44 flex-col gap-2 rounded-md border border-[var(--control-line)] bg-[var(--surface)] p-2">
                {workspaceTools}
              </div>
            </details>
            <button
              type="button"
              className="primary-button"
              disabled={publishing}
              onClick={() => void publish()}
            >
              {publishing ? "Publication…" : "Publier"}
            </button>
          </div>
        </div>
      </header>
      {readingMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2">
          <span>Mode lecture</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => updateAppearance({ readingMode: false })}
          >
            Revenir à la rédaction
          </button>
        </div>
      ) : null}
      {operationStatus ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2 text-sm"
        >
          <span>{operationStatus}</span>
          {payload.space.publishedAt ? (
            <Link
              href={`/p/${payload.space.slug}?lang=${locale}`}
              className="underline"
            >
              Consulter le portail
            </Link>
          ) : null}
          <button
            type="button"
            className="ml-auto secondary-button"
            onClick={() => setOperationStatus("")}
            aria-label="Masquer la confirmation"
          >
            Fermer
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <nav
          id="workspace-navigation"
          aria-label="Documents de l’espace"
          className="workspace-navigation hidden w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] md:flex"
        >
          {navigationContent}
        </nav>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {active && editorContent ? (
            <>
              <div className="document-heading flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                <div className="document-title min-w-0 flex-1">
                  <input
                    aria-label="Titre du document"
                    className="w-full bg-transparent font-[family-name:var(--font-display)] text-2xl tracking-tight"
                    value={active.title}
                    disabled={preview || readingMode}
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
                <div
                  ref={menuRef}
                  className="document-actions relative flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    className="secondary-button lg:hidden"
                    aria-haspopup="dialog"
                    onClick={() => setPagePanelOpen(true)}
                  >
                    Panneau de page
                  </button>
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
                    ref={menuButtonRef}
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-expanded={menuOpen}
                    aria-controls="document-actions"
                  >
                    Plus
                  </button>
                  {menuOpen ? (
                    <div
                      id="document-actions"
                      aria-label="Actions du document"
                      className="document-menu absolute right-0 top-full z-30 mt-2 max-h-80 w-64 overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] py-1 text-sm shadow-lg"
                    >
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-[var(--surface-hover)]"
                        onClick={() => {
                          setMoveTarget("root");
                          setMovePosition("after");
                          setMenuOpen(false);
                          setMoveOpen(true);
                        }}
                      >
                        Déplacer…
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                        onClick={() => {
                          void patchActive({ kind: "page" });
                          setMenuOpen(false);
                        }}
                      >
                        Convertir en page
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                        onClick={() => {
                          void patchActive({ kind: "category" });
                          setMenuOpen(false);
                        }}
                      >
                        Convertir en catégorie
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                        onClick={() => {
                          void patchActive({ hidden: !active.hidden });
                          setMenuOpen(false);
                        }}
                      >
                        {active.hidden
                          ? "Afficher sur le site"
                          : "Masquer du site"}
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                        onClick={() => void exportMarkdown()}
                      >
                        Exporter Markdown
                      </button>
                      {(payload.space.locales ?? [])
                        .filter((l) => l !== locale)
                        .map((l) => (
                          <button
                            key={l}
                            type="button"
                            className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                            onClick={() => void createDocTranslation(l)}
                          >
                            Traduire en {l}
                          </button>
                        ))}
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-[var(--danger)] hover:bg-[var(--surface-hover)]"
                        onClick={() => void removeDoc()}
                      >
                        Supprimer
                      </button>
                      <div className="my-1 border-t border-[var(--line)]" />
                      <p className="px-3 py-1 text-[10px] uppercase text-[var(--ink-faint)]">
                        Historique
                      </p>
                      {revisions.slice(0, 8).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="block w-full px-3 py-1 text-left text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-hover)]"
                          onClick={() => void restoreRev(r.id)}
                        >
                          Restaurer ·{" "}
                          {formatDistanceToNow(new Date(r.createdAt), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </button>
                      ))}
                      {revisions.length === 0 ? (
                        <div className="px-3 py-1 text-xs text-[var(--ink-faint)]">
                          Aucune révision
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <div
                  className={[
                    "flex min-w-0 flex-col",
                    !readingMode && aiExpanded && sideTab === "ai"
                      ? "flex-1 xl:w-[38%] xl:flex-none xl:min-w-0"
                      : "flex-1",
                  ].join(" ")}
                >
                  <DocEditor
                    key={active.id}
                    documentId={active.id}
                    content={editorContent}
                    editable={!preview && !readingMode}
                    showToolbar={!preview && !readingMode}
                    onChange={onEditorChange}
                    locale={locale}
                  />
                </div>
                <div
                  className={[
                    "workspace-side-panel hidden shrink-0 lg:block",
                    sideTab === "ai"
                      ? aiExpanded
                        ? "w-[min(420px,42vw)] min-w-0 xl:w-[62%] xl:flex-1"
                        : "w-[min(420px,42vw)]"
                      : "w-[320px]",
                  ].join(" ")}
                >
                  {sidePanelContent}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--ink-faint)]">
              <p>Sélectionnez une page ou créez-en une.</p>
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--on-accent)]"
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
        onClose={() => {
          setGithubOpen(false);
          setGithubPreferCurrent(false);
        }}
        onImported={(space) => void reloadSpace(space.id)}
        targetSpaceId={payload.space.id}
        targetSpaceName={payload.space.name}
        preferCurrentSpace={githubPreferCurrent}
      />

      <Dialog
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        title="Outils"
      >
        {account.role !== "viewer" ? (
          <SpaceSyncPanel
            spaceId={payload.space.id}
            importSource={payload.space.importSource}
            syncBusy={syncBusy}
            onImportSourceChange={(source) =>
              setPayload((prev) => ({
                ...prev,
                space: { ...prev.space, importSource: source },
              }))
            }
            onResync={() =>
              syncSpaceImport({ force: true, spaceId: payload.space.id })
            }
            onOpenGithubImport={() => {
              setToolsOpen(false);
              setGithubPreferCurrent(true);
              setGithubOpen(true);
            }}
          />
        ) : null}
        <section className="mb-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Importer
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() => void createSpace()}
            >
              Nouvel espace
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() => {
                setToolsOpen(false);
                setGithubPreferCurrent(false);
                setGithubOpen(true);
              }}
            >
              Depuis GitHub
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() => fileRef.current?.click()}
            >
              Fichier Markdown
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() => void createVersion()}
            >
              Nouvelle version
            </button>
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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Modèles
          </h3>
          {(payload.templates ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              className="mb-1 block w-full rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
              onClick={() =>
                void createDoc(null, {
                  title: t.name,
                  content: structuredClone(t.content),
                })
              }
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-[var(--ink-faint)]">
                {t.description}
              </div>
            </button>
          ))}
        </section>

        <section className="mb-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Extraits réutilisables
          </h3>
          <div className="space-y-1 text-xs text-[var(--ink-muted)]">
            {payload.variables.map((v) => (
              <div
                key={v.id}
                className="flex justify-between gap-2 rounded border border-[var(--line)] px-2 py-1"
              >
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

        {isAdmin ? (
          <IntegrationsPanel
            onImported={(id) => {
              setToolsOpen(false);
              void reloadSpace(id);
            }}
            integrations={payload.integrations ?? []}
            spaceId={payload.space.id}
            onChange={(integrations) =>
              setPayload((prev) => ({ ...prev, integrations }))
            }
            onOpenGithubImport={() => {
              setToolsOpen(false);
              setGithubPreferCurrent(false);
              setGithubOpen(true);
            }}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Paramètres"
      >
        <TabList
          id="space-settings"
          label="Réglages de l’espace"
          value={settingsTab}
          onChange={setSettingsTab}
          items={[
            ["space", "Espace"],
            ["org-llm", "IA (organisation)"],
            ["space-llm", "IA (espace)"],
          ]}
        />
        <div
          role="tabpanel"
          id="space-settings-panel"
          aria-labelledby={`space-settings-${settingsTab}`}
          tabIndex={0}
          className="pt-4"
        >
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
                  accessPassword:
                    String(fd.get("accessPassword") ?? "") || null,
                  isPublic: fd.get("isPublic") === "on",
                  defaultLocale: String(fd.get("defaultLocale") ?? "en"),
                  locales: locales.length ? locales : ["en"],
                  versionLabel: String(fd.get("versionLabel") ?? "current"),
                });
              }}
            >
              <label className="text-sm">
                Nom
                <input
                  name="name"
                  defaultValue={payload.space.name}
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                />
              </label>
              <label className="text-sm">
                Description
                <input
                  name="description"
                  defaultValue={payload.space.description}
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                />
              </label>
              <label className="text-sm">
                Libellé de version
                <input
                  name="versionLabel"
                  defaultValue={payload.space.versionLabel ?? "current"}
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Langue par défaut
                  <input
                    name="defaultLocale"
                    defaultValue={payload.space.defaultLocale ?? "en"}
                    className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                  />
                </label>
                <label className="text-sm">
                  Langues
                  <input
                    name="locales"
                    defaultValue={(payload.space.locales ?? ["en", "fr"]).join(
                      ", ",
                    )}
                    className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                  />
                </label>
              </div>
              <label className="text-sm">
                Couleur
                <input
                  name="accentColor"
                  type="color"
                  defaultValue={payload.space.accentColor}
                  className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-[var(--bg)]"
                />
              </label>
              <label className="text-sm">
                Mot de passe du site
                <input
                  name="accessPassword"
                  type="password"
                  defaultValue={payload.space.accessPassword ?? ""}
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="isPublic"
                  type="checkbox"
                  defaultChecked={payload.space.isPublic}
                />
                Public
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
                  onClick={() => setSettingsOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--on-accent)]"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          ) : null}

          {settingsTab === "org-llm" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveOrgLlm(llmFromForm(new FormData(e.currentTarget)));
              }}
            >
              <p className="text-xs text-[var(--ink-muted)]">
                Configuration LLM par défaut pour toute l’organisation (OpenAI,
                Anthropic, Ollama, LM Studio, vLLM…).
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={orgLlm.enabled}
                />
                Activer l’assistant IA
              </label>
              <LlmSettingsFields initial={orgLlm} />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
                  onClick={() => setSettingsOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--on-accent)]"
                >
                  Enregistrer
                </button>
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
                void saveSpaceSettings({ llm: llmFromForm(fd) });
              }}
            >
              <p className="text-xs text-[var(--ink-muted)]">
                Surcharge optionnelle pour cet espace. Sinon, l’IA
                organisationnelle est utilisée.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="override"
                  type="checkbox"
                  defaultChecked={Boolean(spaceLlm)}
                />
                Utiliser une configuration dédiée à cet espace
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={spaceLlm?.enabled ?? false}
                />
                Activer pour cet espace
              </label>
              <LlmSettingsFields
                initial={spaceLlm ?? { ...orgLlm, enabled: false }}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
                  onClick={() => setSettingsOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--on-accent)]"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title="Documents"
        className="navigation-dialog"
      >
        <nav
          id="workspace-mobile-navigation"
          aria-label="Documents de l’espace"
        >
          {navigationContent}
        </nav>
      </Dialog>
      <Dialog
        open={pagePanelOpen}
        onClose={() => setPagePanelOpen(false)}
        title="Panneau de page"
        className="page-panel-dialog"
      >
        {sidePanelContent}
      </Dialog>
      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Déplacer le document"
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!active || moving) return;
            setMoving(true);
            try {
              await onReorder(active.id, moveTarget, movePosition);
              setMoveOpen(false);
              window.requestAnimationFrame(() =>
                document.getElementById("main-content")?.focus(),
              );
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Déplacement impossible.",
              );
            } finally {
              setMoving(false);
            }
          }}
        >
          <p>Déplacer « {active?.title} » sans glisser-déposer.</p>
          <label>
            Destination
            <select
              aria-label="Destination"
              value={moveTarget}
              onChange={(e) => {
                setMoveTarget(e.target.value);
                if (
                  localeDocs.find((d) => d.id === e.target.value)?.kind ===
                  "link"
                )
                  setMovePosition("before");
              }}
            >
              <option value="root">Fin de l’arborescence principale</option>
              {localeDocs
                .filter(
                  (d) =>
                    !documentTrail(localeDocs, d.id).some(
                      (parent) => parent.id === activeId,
                    ),
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {documentTrail(localeDocs, d.id)
                      .map((p) => p.title)
                      .join(" / ")}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Position
            <select
              aria-label="Position"
              value={movePosition}
              disabled={moveTarget === "root"}
              onChange={(e) =>
                setMovePosition(e.target.value as typeof movePosition)
              }
            >
              <option value="before">Avant cette page</option>
              <option value="after">Après cette page</option>
              <option
                value="inside"
                disabled={
                  localeDocs.find((d) => d.id === moveTarget)?.kind === "link"
                }
              >
                Dans cette page ou catégorie
              </option>
            </select>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setMoveOpen(false)}
            >
              Annuler
            </button>
            <button type="submit" className="primary-button" disabled={moving}>
              {moving ? "Déplacement…" : "Déplacer"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
