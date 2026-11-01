"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { MarkdownFormat, Space } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (space: Space) => void;
  /** When set, import can upsert into this Space instead of creating a new one */
  targetSpaceId?: string | null;
  targetSpaceName?: string | null;
  /** Default the “update current space” checkbox */
  preferCurrentSpace?: boolean;
};

const FORMATS: { id: MarkdownFormat; label: string }[] = [
  { id: "auto", label: "Auto-détection" },
  { id: "commonmark", label: "CommonMark" },
  { id: "gfm", label: "GitHub Flavored (GFM)" },
  { id: "mdx", label: "MDX" },
  { id: "obsidian", label: "Obsidian" },
];

const INTERVALS = [
  { minutes: 30, label: "Toutes les 30 min" },
  { minutes: 60, label: "Toutes les heures" },
  { minutes: 360, label: "Toutes les 6 heures" },
  { minutes: 1440, label: "Une fois par jour" },
];

export function GitHubImportModal({
  open,
  onClose,
  onImported,
  targetSpaceId,
  targetSpaceName,
  preferCurrentSpace = false,
}: Props) {
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("docs");
  const [token, setToken] = useState("");
  const [format, setFormat] = useState<MarkdownFormat>("auto");
  const [locale, setLocale] = useState("en");
  const [autoSync, setAutoSync] = useState(true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(60);
  const [intoCurrent, setIntoCurrent] = useState(
    Boolean(preferCurrentSpace && targetSpaceId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setIntoCurrent(Boolean(preferCurrentSpace && targetSpaceId));
    setError("");
  }, [open, preferCurrentSpace, targetSpaceId]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository,
          branch,
          path,
          token: token || undefined,
          format,
          locale,
          useSavedToken: true,
          autoSync,
          syncIntervalMinutes,
          spaceId:
            intoCurrent && targetSpaceId ? targetSpaceId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      const imported = Number(data.imported ?? 0);
      const updated = Number(data.updated ?? 0);
      const matched = Number(data.matched ?? imported);
      const skipped = Number(data.skipped ?? 0);
      const failed = Array.isArray(data.failed) ? data.failed.length : 0;
      const notes: string[] = [];
      if (imported) notes.push(`${imported} page(s) ajoutée(s)`);
      if (updated) notes.push(`${updated} mise(s) à jour`);
      if (!imported && !updated)
        notes.push(`${Number(data.imported ?? 0)} page(s) importée(s)`);
      if (matched > imported + updated)
        notes.push(`${matched} Markdown détectés`);
      if (data.truncated)
        notes.push("limite atteinte — affinez le dossier ou réimportez");
      if (skipped) notes.push(`${skipped} ignorée(s) au parsing`);
      if (failed) notes.push(`${failed} non téléchargée(s)`);
      if (autoSync) notes.push("sync auto activée");
      window.alert(notes.join(" · "));
      onImported(data.space);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Importer depuis GitHub">
      <form onSubmit={(e) => void submit(e)} className="w-full">
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Importe les fichiers Markdown/MDX d’un dossier (récursif). La source
          reste liée pour relancer ou synchroniser automatiquement.
        </p>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label>
            Dépôt
            <input
              required
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="owner/repo"
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              Branche
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              />
            </label>
            <label>
              Dossier docs
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="docs"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              />
            </label>
          </div>
          <label>
            Format Markdown
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as MarkdownFormat)}
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
            >
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              Langue
              <input
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              />
            </label>
            <label>
              Jeton d’accès (facultatif)
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_…"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              />
            </label>
          </div>
          {targetSpaceId ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={intoCurrent}
                onChange={(e) => setIntoCurrent(e.target.checked)}
              />
              <span>
                Mettre à jour l’espace actuel
                {targetSpaceName ? ` (${targetSpaceName})` : ""}
                <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                  Sinon, un nouvel espace est créé.
                </span>
              </span>
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            <span>
              Synchronisation automatique
              <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                Reprend le dépôt à l’ouverture de l’espace, selon l’intervalle.
              </span>
            </span>
          </label>
          {autoSync ? (
            <label>
              Intervalle
              <select
                value={syncIntervalMinutes}
                onChange={(e) =>
                  setSyncIntervalMinutes(Number(e.target.value))
                }
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              >
                {INTERVALS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--on-accent)] disabled:opacity-50"
          >
            {busy ? "Import…" : "Importer le dépôt"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
