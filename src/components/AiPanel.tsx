"use client";

import { useState } from "react";
import type { AiAction } from "@/lib/llm";

type Props = {
  spaceId: string;
  documentId: string | null;
  llmEnabled: boolean;
  onInsert: (text: string) => void;
};

const ACTIONS: { id: AiAction; label: string; hint: string }[] = [
  {
    id: "ask",
    label: "Question",
    hint: "Répondre à partir de cette page / Space",
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

export function AiPanel({ spaceId, documentId, llmEnabled, onInsert }: Props) {
  const [action, setAction] = useState<AiAction>("ask");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId,
          documentId,
          action,
          prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResult(String(data.text ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!llmEnabled) {
    return (
      <div className="flex flex-col gap-2 text-sm text-[var(--ink-muted)]">
        <p>
          Aucun LLM actif. Configurez une clé API dans{" "}
          <strong>Paramètres → IA</strong> (organisation ou Space).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-[12px] text-[var(--ink-muted)]">
        Analysez la doc, rédigez ou corrigez du texte avec le modèle configuré.
      </p>
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
      <textarea
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          action === "ask"
            ? "Ex. Que dit cette page sur le KV cache ?"
            : action === "draft"
              ? "Ex. Écrire une intro sur l’interop BitNet…"
              : "Collez le texte à corriger, ou décrivez la passe de relecture."
        }
        className="w-full resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        disabled={busy || !prompt.trim()}
        className="self-end rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        onClick={() => void run()}
      >
        {busy ? "Génération…" : "Envoyer"}
      </button>
      {error ? <p className="text-xs text-[#A32D2D]">{error}</p> : null}
      {result ? (
        <div className="flex flex-col gap-2">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--bg)] p-2 text-xs leading-relaxed">
            {result}
          </pre>
          <button
            type="button"
            className="self-end rounded-md border border-[var(--line)] px-2 py-1 text-xs"
            onClick={() => onInsert(result)}
          >
            Insérer dans la page
          </button>
        </div>
      ) : null}
    </div>
  );
}
