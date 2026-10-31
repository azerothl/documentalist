"use client";

import { useState } from "react";
import {
  INTEGRATION_CATALOG,
  type Integration,
  type IntegrationProvider,
} from "@/lib/types";

type Props = {
  integrations: Integration[];
  spaceId: string;
  onChange: (integrations: Integration[]) => void;
  onOpenGithubImport: () => void;
};

export function IntegrationsPanel({
  integrations,
  spaceId,
  onChange,
  onOpenGithubImport,
}: Props) {
  const [provider, setProvider] = useState<IntegrationProvider>("github");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const catalog = INTEGRATION_CATALOG.find((c) => c.provider === provider)!;
  const [form, setForm] = useState<Record<string, string>>({});

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          name: catalog.title,
          enabled: true,
          config: form,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onChange([
        ...integrations.filter((i) => i.provider !== provider),
        data.integration,
      ]);
      setMessage(`${catalog.title} connecté`);
      setForm({});
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/integrations?id=${id}`, { method: "DELETE" });
    onChange(integrations.filter((i) => i.id !== id));
  }

  async function importOpenApi() {
    const openapi = integrations.find((i) => i.provider === "openapi");
    const specUrl = openapi?.config.specUrl || window.prompt("OpenAPI URL");
    if (!specUrl) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/openapi/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, specUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setMessage(`${data.imported} pages OpenAPI importées`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
        Intégrations
      </p>
      <div className="flex flex-wrap gap-1">
        {INTEGRATION_CATALOG.map((c) => (
          <button
            key={c.provider}
            type="button"
            className={[
              "rounded-md border px-2 py-1 text-xs",
              provider === c.provider
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--line)]",
            ].join(" ")}
            onClick={() => {
              setProvider(c.provider);
              setForm({});
            }}
          >
            {c.title}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--ink-muted)]">{catalog.description}</p>
      {catalog.fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-xs">
          {field.label}
          <input
            type={field.secret ? "password" : "text"}
            value={form[field.key] ?? ""}
            placeholder={field.placeholder}
            className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
            onChange={(e) =>
              setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
          />
        </label>
      ))}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={busy}
          className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs text-white disabled:opacity-50"
          onClick={() => void save()}
        >
          Enregistrer
        </button>
        {provider === "github" ? (
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
            onClick={onOpenGithubImport}
          >
            Importer un dépôt…
          </button>
        ) : null}
        {provider === "openapi" ? (
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
            onClick={() => void importOpenApi()}
          >
            Importer le spec
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="text-xs text-[var(--ink-muted)]">{message}</p>
      ) : null}
      <ul className="space-y-1">
        {integrations.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between rounded-md border border-[var(--line)] px-2 py-1 text-xs"
          >
            <span>
              {i.name}
              {i.enabled ? "" : " (off)"}
              {i.lastSyncAt ? " · synchronisé" : ""}
            </span>
            <button
              type="button"
              className="text-[var(--ink-faint)] hover:text-[var(--ink)]"
              onClick={() => void remove(i.id)}
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
