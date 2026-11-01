"use client";

import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useId } from "react";
import { TabList } from "@/components/TabList";
import { AiPanel } from "@/components/AiPanel";
import { extractHeadings } from "@/lib/tiptap-text";
import type { Comment, DocumentRecord, TipTapDoc } from "@/lib/types";

type Tab = "contents" | "comments" | "seo" | "ai";

type Props = {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  content: TipTapDoc;
  document: DocumentRecord;
  comments: Comment[];
  spaceId: string;
  spaceName: string;
  llmEnabled: boolean;
  aiExpanded: boolean;
  onAiExpandedChange: (expanded: boolean) => void;
  onAddComment: (body: string) => void;
  onToggleComment: (id: string, resolved: boolean) => void;
  onPatchDocument: (patch: Partial<DocumentRecord>) => void;
  onJumpToHeading: (index: number) => void;
  onInsertAiText: (text: string) => void;
};

export function SidePanel({
  tab,
  onTabChange,
  content,
  document,
  comments,
  spaceId,
  spaceName,
  llmEnabled,
  aiExpanded,
  onAiExpandedChange,
  onAddComment,
  onToggleComment,
  onPatchDocument,
  onJumpToHeading,
  onInsertAiText,
}: Props) {
  const tabsId = useId();
  const headings = extractHeadings(content);
  const openComments = comments.filter((c) => !c.resolved);

  return (
    <aside
      aria-label="Panneau de page"
      className="flex h-full min-h-0 flex-col border-l border-[var(--line)] bg-[var(--surface)]"
    >
      <TabList
        id={tabsId}
        label="Outils de la page"
        value={tab}
        onChange={onTabChange}
        items={[
          ["contents", "Sommaire"],
          [
            "comments",
            `Commentaires${openComments.length ? ` (${openComments.length})` : ""}`,
          ],
          ["seo", "SEO"],
          ["ai", "IA"],
        ]}
      />

      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-${tab}`}
        tabIndex={0}
        className={[
          "flex min-h-0 flex-1 flex-col p-3",
          tab === "ai" ? "overflow-hidden" : "overflow-auto",
        ].join(" ")}
      >
        {tab === "contents" ? (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
              Sur cette page
            </p>
            {headings.length === 0 ? (
              <p className="text-[13px] text-[var(--ink-faint)]">
                Les titres H1–H3 apparaîtront ici pendant la rédaction.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {headings.map((h, index) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="w-full rounded px-1 py-1 text-left text-[13px] text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                      style={{ paddingLeft: 4 + (h.level - 1) * 10 }}
                      onClick={() => onJumpToHeading(index)}
                      title={`Aller à « ${h.text} »`}
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {tab === "comments" ? (
          <div className="flex h-full flex-col gap-3">
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const body = String(fd.get("body") ?? "").trim();
                if (!body) return;
                onAddComment(body);
                e.currentTarget.reset();
              }}
            >
              <textarea
                aria-label="Votre commentaire"
                name="body"
                rows={3}
                placeholder="Laisser un commentaire…"
                className="w-full resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="self-end rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]"
              >
                Commenter
              </button>
            </form>
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className={[
                    "rounded-md border border-[var(--line)] p-2 text-sm",
                    c.resolved ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--ink-faint)]">
                    <span>{c.author}</span>
                    <span>
                      {formatDistanceToNow(new Date(c.createdAt), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </span>
                  </div>
                  <p className="text-[var(--ink-muted)]">{c.body}</p>
                  <button
                    type="button"
                    className="mt-2 text-[11px] text-[var(--accent)]"
                    onClick={() => onToggleComment(c.id, !c.resolved)}
                  >
                    {c.resolved ? "Rouvrir" : "Résoudre"}
                  </button>
                </li>
              ))}
              {comments.length === 0 ? (
                <li className="text-[13px] text-[var(--ink-faint)]">
                  Pas encore de commentaires.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {tab === "seo" ? (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-[12px] text-[var(--ink-muted)]">
              Ces champs contrôlent l’URL et l’aperçu de la page sur le site
              public.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Titre SEO
              </span>
              <input
                className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                value={document.seoTitle ?? ""}
                placeholder={document.title}
                onChange={(e) =>
                  onPatchDocument({ seoTitle: e.target.value || null })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Description pour les moteurs de recherche
              </span>
              <textarea
                rows={3}
                className="resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                value={document.seoDescription ?? ""}
                placeholder="Courte description pour les moteurs de recherche"
                onChange={(e) =>
                  onPatchDocument({ seoDescription: e.target.value || null })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Slug d’URL
              </span>
              <input
                className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs"
                value={document.slug}
                onChange={(e) => onPatchDocument({ slug: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Tags
              </span>
              <input
                className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                value={(document.tags ?? []).join(", ")}
                placeholder="intro, api, guide"
                onChange={(e) =>
                  onPatchDocument({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={document.hidden}
                onChange={(e) => onPatchDocument({ hidden: e.target.checked })}
              />
              Masquer sur le site public
            </label>
          </div>
        ) : null}

        {tab === "ai" ? (
          <AiPanel
            spaceId={spaceId}
            spaceName={spaceName}
            documentId={document.id}
            llmEnabled={llmEnabled}
            expanded={aiExpanded}
            onExpandedChange={onAiExpandedChange}
            onInsert={onInsertAiText}
          />
        ) : null}
      </div>
    </aside>
  );
}
