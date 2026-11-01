import type { DocSection, DocumentRecord } from "./types";
import { docSection } from "./types";

export const SECTION_IDS: DocSection[] = ["learn", "reference", "blog"];

export function isSection(value: string | undefined): value is DocSection {
  return value === "learn" || value === "reference" || value === "blog";
}

/** Normalize a repo folder setting (trim slashes); empty = not configured. */
export function cleanRoot(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function underRoot(filePath: string, root: string) {
  return !root || filePath === root || filePath.startsWith(`${root}/`);
}

/**
 * When folders overlap (docs + docs/learn), a file belongs to the most
 * specific configured root so it is imported once.
 */
export function ownsFile(
  filePath: string,
  root: string,
  allRoots: string[],
): boolean {
  if (!underRoot(filePath, root)) return false;
  return !allRoots.some(
    (other) =>
      other !== root &&
      other.length > root.length &&
      underRoot(filePath, other),
  );
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Release-note date from frontmatter (`date`, `published`) or the file path. */
export function blogDate(
  filePath: string,
  frontmatter: Record<string, string>,
): string | null {
  const raw =
    frontmatter.date || frontmatter.published || frontmatter.publishedAt || "";
  const numeric = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (numeric) return iso(+numeric[1], +numeric[2], +numeric[3]);
  if (raw) {
    // Textual dates ("December 5, 2024") are parsed in local time.
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()))
      return iso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  const fromPath = filePath.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  return fromPath ? iso(+fromPath[1], +fromPath[2], +fromPath[3]) : null;
}

/** A dateless index/README at the blog root introduces the blog. */
export function isBlogIntro(doc: DocumentRecord): boolean {
  return (
    docSection(doc) === "blog" &&
    !doc.date &&
    /(^|\/)(index|readme)\.(md|mdx|markdown)$/i.test(doc.sourcePath ?? "")
  );
}

/** Newest first; undated posts last, then by title. */
export function compareBlogPosts(a: DocumentRecord, b: DocumentRecord) {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return a.position - b.position || a.title.localeCompare(b.title);
}

export function formatPostDate(date: string | null | undefined, locale = "fr") {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Documents of one tab. A child whose parent sits in another tab (data
 * written before tabs existed) is re-rooted so it stays reachable.
 */
export function sectionDocuments<T extends DocumentRecord>(
  documents: T[],
  section: DocSection,
): T[] {
  const inSection = documents.filter((d) => docSection(d) === section);
  const ids = new Set(inSection.map((d) => d.id));
  return inSection.map((d) =>
    d.parentId && !ids.has(d.parentId) ? { ...d, parentId: null } : d,
  );
}

/** First tab holding documents, in navigation order (Learn, Reference, Blog). */
export function defaultSection(documents: DocumentRecord[]): DocSection {
  return (
    SECTION_IDS.find((s) => documents.some((d) => docSection(d) === s)) ??
    "reference"
  );
}
