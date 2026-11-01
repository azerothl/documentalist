"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { MarkdownFormat, Space } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (space: Space) => void;
};

const FORMATS: { id: MarkdownFormat; label: string }[] = [
  { id: "auto", label: "Auto-détection" },
  { id: "commonmark", label: "CommonMark" },
  { id: "gfm", label: "GitHub Flavored (GFM)" },
  { id: "mdx", label: "MDX" },
  { id: "obsidian", label: "Obsidian" },
];

export function GitHubImportModal({ open, onClose, onImported }: Props) {
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("docs");
  const [token, setToken] = useState("");
  const [format, setFormat] = useState<MarkdownFormat>("auto");
  const [locale, setLocale] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
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
          Importe les fichiers Markdown/MDX dans un nouvel espace (les dossiers
          deviennent des catégories). Dépôts publics : sans jeton. Dépôts privés
          : jeton d’accès requis.
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
