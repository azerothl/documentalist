"use client";

import { useEffect, useRef, useState } from "react";
import { AiMarkdown } from "@/components/AiMarkdown";
import type { AiContextScope } from "@/lib/ai-context";
import type { AiAction } from "@/lib/llm";

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  truncated?: boolean;
};

type Props = {
  spaceId: string;
  spaceName: string;
  documentId: string | null;
  llmEnabled: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onInsert: (text: string) => void;
};

const ACTIONS: { id: AiAction; label: string; hint: string }[] = [
  {
    id: "ask",
    label: "Question",
    hint: "Répondre à partir de la documentation (page, liens, espace)",
  },
  {
    id: "draft",
    label: "Rédiger",
    hint: "Proposer un paragraphe ou une section",
  },
  {
    id: "proofread",
    label: "Corriger",
    hint: "Améliorer clarté et style du texte",
  },
];

const SCOPES: { id: AiContextScope; label: string; hint: string }[] = [
  {
    id: "page",
    label: "Page",
    hint: "Uniquement la page ouverte",
  },
  {
    id: "related",
    label: "Page + liens",
    hint: "Page courante et pages référencées (liens internes)",
  },
  {
    id: "space",
    label: "Espace entier",
    hint: "Toutes les pages de l’espace (priorité à la page et aux liens)",
  },
];

function newId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function AiPanel({
  spaceId,
  spaceName,
  documentId,
  llmEnabled,
  expanded,
  onExpandedChange,
  onInsert,
}: Props) {
  const [action, setAction] = useState<AiAction>("ask");
  const [scope, setScope] = useState<AiContextScope>("space");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function run() {
    const text = prompt.trim();
    if (!text || busy) return;

    const userMsg: AiChatMessage = {
      id: newId(),
      role: "user",
      content: text,
    };
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId,
          documentId,
          action,
          scope: action === "proofread" ? "page" : scope,
          prompt: text,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: String(data.text ?? ""),
          sources: Array.isArray(data.sources)
            ? data.sources.map(String)
            : undefined,
          truncated: Boolean(data.truncated),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setPrompt(text);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function resetConversation() {
    setMessages([]);
    setError("");
    setPrompt("");
    inputRef.current?.focus();
  }

  if (!llmEnabled) {
    return (
      <div className="flex flex-col gap-2 text-sm text-[var(--ink-muted)]">
        <p>
          Aucun LLM actif. Configurez une clé API dans{" "}
          <strong>Paramètres → IA</strong> (organisation ou espace).
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] text-[var(--ink-muted)]">
          Recherche dans <strong>{spaceName}</strong>
          {expanded
            ? " — vous pouvez enchaîner des questions."
            : ". Agrandissez pour mieux lire."}
        </p>
        <div className="flex shrink-0 gap-1">
          {messages.length > 0 ? (
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px]"
              onClick={resetConversation}
              title="Effacer l’historique"
            >
              Nouveau
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px]"
            onClick={() => onExpandedChange(!expanded)}
            title={expanded ? "Réduire le panneau" : "Agrandir le panneau IA"}
          >
            {expanded ? "Réduire" : "Agrandir"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.hint}
            className={[
              "rounded-md border px-2 py-1 text-xs",
              action === a.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--line)]",
            ].join(" ")}
            onClick={() => setAction(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {action !== "proofread" ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Contexte
          </span>
          <div className="flex flex-wrap gap-1">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                className={[
                  "rounded-md border px-2 py-1 text-xs",
                  scope === s.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)]",
                ].join(" ")}
                onClick={() => setScope(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={threadRef}
        className={[
          "min-h-0 flex-1 space-y-3 overflow-auto rounded-md border border-[var(--line)] bg-[var(--bg)] p-3",
          expanded ? "" : "max-h-[min(52vh,420px)]",
        ].join(" ")}
      >
        {messages.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-faint)]">
            Aucun message pour l’instant. Posez une première question
            ci-dessous, puis continuez la discussion.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={[
                "rounded-md px-2.5 py-2",
                m.role === "user"
                  ? "ml-4 bg-[var(--accent-soft)] text-[var(--ink)]"
                  : "mr-2 border border-[var(--line)] bg-[var(--surface)]",
              ].join(" ")}
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                {m.role === "user" ? "Vous" : "Assistant"}
              </div>
              {m.role === "assistant" ? (
                <AiMarkdown content={m.content} compact={!expanded} />
              ) : (
                <div
                  className={[
                    "whitespace-pre-wrap leading-relaxed text-[var(--ink)]",
                    expanded ? "text-[14px]" : "text-[12.5px]",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              )}
              {m.role === "assistant" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {m.sources && m.sources.length > 0 ? (
                    <details className="min-w-0 flex-1 text-[11px] text-[var(--ink-faint)]">
                      <summary className="cursor-pointer select-none">
                        Sources ({m.sources.length}
                        {m.truncated ? ", tronqué" : ""})
                      </summary>
                      <p className="mt-1 leading-snug">
                        {m.sources.join(" · ")}
                      </p>
                    </details>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[11px]"
                    onClick={() => onInsert(m.content)}
                  >
                    Insérer
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
        {busy ? (
          <p className="text-[12px] text-[var(--ink-faint)]">Génération…</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-2">
        <textarea
          aria-label="Votre demande à l’assistant"
          ref={inputRef}
          rows={expanded ? 3 : 2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          placeholder={
            messages.length > 0
              ? "Question suivante… (Entrée pour envoyer, Maj+Entrée pour une ligne)"
              : action === "ask"
                ? scope === "space"
                  ? "Ex. À quoi sert Rbitnet ?"
                  : "Ex. Que dit cette page sur le KV cache ?"
                : action === "draft"
                  ? "Ex. Écrire une introduction cohérente avec l’espace…"
                  : "Collez le texte à corriger…"
          }
          className="w-full resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy || !prompt.trim()}
          className="self-end rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)] disabled:opacity-50"
          onClick={() => void run()}
        >
          {busy
            ? "Génération…"
            : messages.length > 0
              ? "Envoyer la suite"
              : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
