"use client";

import { useEffect, useId, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { InfoTip } from "@/components/InfoTip";
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

/** Label + help bubble + input, with the tooltip kept outside the <label>. */
function Field({
  label,
  help,
  children,
  id,
}: {
  label: string;
  help?: React.ReactNode;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {help ? <InfoTip label={`Aide : ${label}`}>{help}</InfoTip> : null}
      </div>
      {children}
    </div>
  );
}

export function GitHubImportModal({
  open,
  onClose,
  onImported,
  targetSpaceId,
  targetSpaceName,
  preferCurrentSpace = false,
}: Props) {
  const ids = useId();
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("docs");
  const [learnPath, setLearnPath] = useState("");
  const [blogPath, setBlogPath] = useState("");
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
    setAutoSync(true);
    setSyncIntervalMinutes(60);
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
          learnPath: learnPath.trim() || undefined,
          blogPath: blogPath.trim() || undefined,
          token: token || undefined,
          format,
          locale,
          useSavedToken: true,
          autoSync,
          syncIntervalMinutes,
          spaceId: intoCurrent && targetSpaceId ? targetSpaceId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      const imported = Number(data.imported ?? 0);
      const updated = Number(data.updated ?? 0);
      const matched = data.matched == null ? null : Number(data.matched);
      const skipped = Number(data.skipped ?? 0);
      const failed = Array.isArray(data.failed) ? data.failed.length : 0;
      const notes: string[] = [];
      if (imported) notes.push(`${imported} page(s) ajoutée(s)`);
      if (updated) notes.push(`${updated} mise(s) à jour`);
      if (matched != null && Number.isFinite(matched))
        notes.push(`${matched} Markdown détectés`);
      if (data.truncated)
        notes.push("limite atteinte — affinez le dossier ou réimportez");
      if (skipped) notes.push(`${skipped} ignorée(s) au parsing`);
      if (failed) notes.push(`${failed} non téléchargée(s)`);
      if (autoSync) notes.push("sync auto activée");
      if (!notes.length) notes.push("Aucune page importée");
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
        <p className="-mt-2 text-sm text-[var(--ink-muted)]">
          Importe les fichiers Markdown/MDX de chaque dossier (récursif). La
          source reste liée pour relancer ou synchroniser automatiquement.
        </p>
        <div className="mt-5 flex flex-col gap-4 text-sm">
          <Field
            id={`${ids}-repo`}
            label="Dépôt"
            help="Nom du dépôt GitHub au format owner/repo, ou son URL github.com."
          >
            <input
              id={`${ids}-repo`}
              required
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="owner/repo"
              className="field-input"
            />
          </Field>
          <Field id={`${ids}-branch`} label="Branche">
            <input
              id={`${ids}-branch`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="field-input"
            />
          </Field>

          <fieldset className="field-group grid gap-4">
            <legend>Dossiers et onglets du portail</legend>
            <Field
              id={`${ids}-docs`}
              label="Dossier docs"
              help={
                <>
                  Alimente l’onglet <strong>Reference</strong> : la
                  documentation de référence (API, composants, options). Chemin
                  depuis la racine du dépôt, par exemple <code>docs</code>.
                </>
              }
            >
              <input
                id={`${ids}-docs`}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="docs"
                aria-describedby={`${ids}-docs-hint`}
                className="field-input"
              />
              <span id={`${ids}-docs-hint`} className="field-hint">
                Onglet Reference
              </span>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={`${ids}-learn`}
                label="Dossier Learn"
                help={
                  <>
                    Alimente l’onglet <strong>Learn</strong> : guides pas à pas,
                    tutoriels et parcours e-learning. Laissez vide pour ne pas
                    créer cet onglet.
                  </>
                }
              >
                <input
                  id={`${ids}-learn`}
                  value={learnPath}
                  onChange={(e) => setLearnPath(e.target.value)}
                  placeholder="learn"
                  aria-describedby={`${ids}-learn-hint`}
                  className="field-input"
                />
                <span id={`${ids}-learn-hint`} className="field-hint">
                  Facultatif · onglet Learn
                </span>
              </Field>
              <Field
                id={`${ids}-blog`}
                label="Dossier Blog"
                help={
                  <>
                    Alimente l’onglet <strong>Blog</strong> avec les notes de
                    version : un fichier par version, classé du plus récent au
                    plus ancien d’après le champ <code>date</code> du
                    frontmatter ou une date dans le chemin (
                    <code>2026/10/01</code>). Laissez vide pour ne pas créer cet
                    onglet.
                  </>
                }
              >
                <input
                  id={`${ids}-blog`}
                  value={blogPath}
                  onChange={(e) => setBlogPath(e.target.value)}
                  placeholder="blog"
                  aria-describedby={`${ids}-blog-hint`}
                  className="field-input"
                />
                <span id={`${ids}-blog-hint`} className="field-hint">
                  Facultatif · notes de version
                </span>
              </Field>
            </div>
          </fieldset>

          <Field
            id={`${ids}-format`}
            label="Format Markdown"
            help="L’auto-détection reconnaît GFM, MDX et Obsidian. Le JavaScript des fichiers MDX n’est jamais exécuté."
          >
            <select
              id={`${ids}-format`}
              value={format}
              onChange={(e) => setFormat(e.target.value as MarkdownFormat)}
              className="field-input"
            >
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${ids}-locale`}
              label="Langue"
              help="Code de la langue des fichiers importés, par exemple en ou fr."
            >
              <input
                id={`${ids}-locale`}
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="field-input"
              />
            </Field>
            <Field
              id={`${ids}-token`}
              label="Jeton d’accès (facultatif)"
              help="Nécessaire pour un dépôt privé. Sans jeton, celui enregistré dans Outils → Intégrations est utilisé."
            >
              <input
                id={`${ids}-token`}
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_…"
                autoComplete="off"
                className="field-input"
              />
            </Field>
          </div>
          {targetSpaceId ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={intoCurrent}
                onChange={(e) => setIntoCurrent(e.target.checked)}
              />
              <span className="font-semibold">
                Mettre à jour l’espace actuel
                {targetSpaceName ? ` (${targetSpaceName})` : ""}
                <span className="field-hint">
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
            <span className="font-semibold">
              Synchronisation automatique
              <span className="field-hint">
                Reprend le dépôt à l’ouverture de l’espace, selon l’intervalle.
              </span>
            </span>
          </label>
          {autoSync ? (
            <Field id={`${ids}-interval`} label="Intervalle">
              <select
                id={`${ids}-interval`}
                value={syncIntervalMinutes}
                onChange={(e) => setSyncIntervalMinutes(Number(e.target.value))}
                className="field-input"
              >
                {INTERVALS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" disabled={busy} className="primary-button">
            {busy ? "Import…" : "Importer le dépôt"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
