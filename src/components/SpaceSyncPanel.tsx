"use client";

import { useState } from "react";
import type { SpaceImportSource } from "@/lib/types";

type Props = {
  spaceId: string;
  importSource: SpaceImportSource | null;
  syncBusy: boolean;
  onImportSourceChange: (source: SpaceImportSource | null) => void;
  onResync: () => Promise<void>;
  onOpenGithubImport: () => void;
};

const INTERVALS = [
  { minutes: 30, label: "Toutes les 30 min" },
  { minutes: 60, label: "Toutes les heures" },
  { minutes: 360, label: "Toutes les 6 heures" },
  { minutes: 1440, label: "Une fois par jour" },
];

export function SpaceSyncPanel({
  spaceId,
  importSource,
  syncBusy,
  onImportSourceChange,
  onResync,
  onOpenGithubImport,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState<"github" | "gitlab" | "notion">(
    importSource?.provider ?? "github",
  );
  const [repository, setRepository] = useState(importSource?.repository ?? "");
  const [branch, setBranch] = useState(importSource?.branch ?? "main");
  const [path, setPath] = useState(importSource?.path ?? "docs");
  const [autoSync, setAutoSync] = useState(importSource?.autoSync ?? true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(
    importSource?.syncIntervalMinutes ?? 60,
  );

  async function saveSource(next: SpaceImportSource, thenSync = false) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importSource: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
      const saved = (data.space?.importSource ?? next) as SpaceImportSource;
      onImportSourceChange(saved);
      setMessage("Source de synchronisation enregistrée");
      if (thenSync) {
        await onResync();
        setMessage("Synchronisation terminée");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  async function linkAndSync() {
    if (provider !== "notion" && !repository.trim()) {
      setMessage("Indiquez le dépôt (owner/repo ou groupe/projet).");
      return;
    }
    const next: SpaceImportSource = {
      provider,
      repository: repository.trim() || "notion",
      branch: branch.trim() || "main",
      path: path.replace(/^\/+|\/+$/g, "") || "docs",
      format: "auto",
      locale: importSource?.locale ?? "en",
      autoSync,
      syncIntervalMinutes,
      lastSyncAt: null,
      lastSyncError: null,
    };
    await saveSource(next, true);
  }

  async function updateSettings(patch: Partial<SpaceImportSource>) {
    if (!importSource) return;
    await saveSource({ ...importSource, ...patch }, false);
  }

  return (
    <section className="mb-5 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
        Synchronisation
      </h3>
      {importSource ? (
        <div className="space-y-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
          <p className="font-medium">
            {importSource.provider} · {importSource.repository}
            {importSource.branch ? `@${importSource.branch}` : ""}
            {importSource.path ? ` / ${importSource.path}` : ""}
          </p>
          {importSource.lastSyncAt ? (
            <p className="text-xs text-[var(--ink-muted)]">
              Dernière sync :{" "}
              {new Date(importSource.lastSyncAt).toLocaleString("fr-FR")}
            </p>
          ) : (
            <p className="text-xs text-[var(--ink-muted)]">
              Pas encore synchronisé depuis la liaison.
            </p>
          )}
          {importSource.lastSyncError ? (
            <p className="text-xs text-[var(--danger)]">
              {importSource.lastSyncError}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={importSource.autoSync}
              disabled={busy || syncBusy}
              onChange={(e) =>
                void updateSettings({ autoSync: e.target.checked })
              }
            />
            Synchronisation automatique (à l’ouverture de l’espace)
          </label>
          {importSource.autoSync ? (
            <label className="block text-xs">
              Intervalle
              <select
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                value={importSource.syncIntervalMinutes}
                disabled={busy || syncBusy}
                onChange={(e) =>
                  void updateSettings({
                    syncIntervalMinutes: Number(e.target.value),
                  })
                }
              >
                {INTERVALS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || syncBusy}
              className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--on-accent)] disabled:opacity-50"
              onClick={() => {
                setBusy(true);
                setMessage("");
                void onResync()
                  .then(() => setMessage("Synchronisation terminée"))
                  .catch((e) =>
                    setMessage(
                      e instanceof Error ? e.message : "Sync échouée",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {syncBusy || busy ? "Sync…" : "Relancer la synchronisation"}
            </button>
            <button
              type="button"
              disabled={busy || syncBusy}
              className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
              onClick={onOpenGithubImport}
            >
              Changer de dépôt…
            </button>
            <button
              type="button"
              disabled={busy || syncBusy}
              className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--ink-muted)]"
              onClick={() => {
                setBusy(true);
                setMessage("");
                void fetch(`/api/spaces/${spaceId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ importSource: null }),
                })
                  .then(async (res) => {
                    const data = await res.json();
                    if (!res.ok)
                      throw new Error(data.error || "Impossible de détacher");
                    onImportSourceChange(null);
                    setMessage("Source détachée");
                  })
                  .catch((e) =>
                    setMessage(
                      e instanceof Error ? e.message : "Impossible de détacher",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Détacher
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
          <p className="text-xs text-[var(--ink-muted)]">
            Aucune source liée à cet espace. Liez un dépôt pour pouvoir
            relancer la sync et activer la synchronisation automatique.
          </p>
          <div className="flex flex-wrap gap-1">
            {(["github", "gitlab", "notion"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={[
                  "rounded-md border px-2 py-1 text-xs capitalize",
                  provider === p
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)]",
                ].join(" ")}
                onClick={() => setProvider(p)}
              >
                {p}
              </button>
            ))}
          </div>
          {provider !== "notion" ? (
            <>
              <label className="block text-xs">
                {provider === "github" ? "Dépôt (owner/repo)" : "Projet GitLab"}
                <input
                  value={repository}
                  onChange={(e) => setRepository(e.target.value)}
                  placeholder={
                    provider === "github" ? "owner/repo" : "groupe/projet"
                  }
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  Branche
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                  />
                </label>
                <label className="block text-xs">
                  Dossier
                  <input
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                  />
                </label>
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--ink-muted)]">
              Utilisez la page Notion configurée dans Intégrations, puis liez et
              synchronisez.
            </p>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            Activer la sync automatique
          </label>
          {autoSync ? (
            <label className="block text-xs">
              Intervalle
              <select
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
                value={syncIntervalMinutes}
                onChange={(e) =>
                  setSyncIntervalMinutes(Number(e.target.value))
                }
              >
                {INTERVALS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || syncBusy}
              className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--on-accent)] disabled:opacity-50"
              onClick={() => void linkAndSync()}
            >
              {busy || syncBusy ? "…" : "Lier et synchroniser"}
            </button>
            {provider === "github" ? (
              <button
                type="button"
                className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
                onClick={onOpenGithubImport}
              >
                Import GitHub guidé…
              </button>
            ) : null}
          </div>
        </div>
      )}
      {message ? (
        <p className="text-xs text-[var(--ink-muted)]">{message}</p>
      ) : null}
    </section>
  );
}
