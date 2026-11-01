"use client";

import { useId, useState } from "react";
import {
  getLlmProvider,
  LLM_PROVIDERS,
} from "@/lib/llm-providers";
import type { LlmProvider, LlmSettings } from "@/lib/types";

type Props = {
  initial: LlmSettings;
  /** Prefix form field names when nesting is needed */
  idPrefix?: string;
};

export function LlmSettingsFields({ initial, idPrefix = "" }: Props) {
  const listId = useId();
  const [provider, setProvider] = useState<LlmProvider>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const info = getLlmProvider(provider);

  function onProviderChange(next: LlmProvider) {
    const defaults = getLlmProvider(next);
    setProvider(next);
    setBaseUrl(defaults.defaultBaseUrl);
    setModel(defaults.defaultModel);
  }

  const name = (field: string) => `${idPrefix}${field}`;

  return (
    <>
      <label className="text-sm">
        Fournisseur
        <select
          name={name("provider")}
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as LlmProvider)}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
        >
          {LLM_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-[var(--ink-faint)]">{info.description}</p>

      <label className="text-sm">
        Clé API
        {info.apiKeyRequired ? "" : " (optionnelle)"}
        <input
          name={name("apiKey")}
          type="password"
          defaultValue={initial.apiKey}
          placeholder={
            info.apiKeyRequired
              ? "sk-…"
              : info.local
                ? "souvent vide pour le local"
                : "si le serveur l’exige"
          }
          required={info.apiKeyRequired}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
        />
      </label>

      <label className="text-sm">
        Base URL
        <input
          name={name("baseUrl")}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={info.defaultBaseUrl || "https://…/v1"}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs"
        />
      </label>

      <label className="text-sm">
        Modèle
        <input
          name={name("model")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          list={listId}
          placeholder={info.defaultModel || "nom-du-modèle"}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
        />
        <datalist id={listId}>
          {info.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      {info.local ? (
        <p className="text-[11px] text-[var(--ink-faint)]">
          Provider local : seules les URL en{" "}
          <code className="font-mono">127.0.0.1</code> /{" "}
          <code className="font-mono">localhost</code> sont acceptées. Pour
          Ollama, tirez d’abord le modèle (
          <code className="font-mono">ollama pull {info.defaultModel || "llama3.2"}</code>
          ).
        </p>
      ) : null}
      {info.id === "lmstudio" || info.id === "vllm" ? (
        <p className="text-[11px] text-[var(--ink-faint)]">
          Indiquez le nom exact du modèle chargé côté serveur (souvent affiché
          dans l’UI locale).
        </p>
      ) : null}
    </>
  );
}
