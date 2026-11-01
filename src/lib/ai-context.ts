import { extractText } from "./tiptap-text";
import type { DocumentRecord, TipTapDoc, TipTapNode } from "./types";

export type AiContextScope = "page" | "related" | "space";

const MAX_TOTAL_CHARS = 28_000;
const MAX_PRIMARY_CHARS = 10_000;
const MAX_RELATED_CHARS = 4_000;
const MAX_RELATED_DOCS = 10;
const MAX_LINK_DEPTH = 2;

export type AiContextDoc = {
  id: string;
  title: string;
  slug: string;
  text: string;
  role: "primary" | "linked" | "space";
};

export type AiContextBundle = {
  docs: AiContextDoc[];
  sources: string[];
  truncated: boolean;
};

function walkLinks(
  node: TipTapNode | TipTapDoc,
  hrefs: string[],
  texts: string[],
) {
  if ("marks" in node && Array.isArray(node.marks) && node.text) {
    for (const mark of node.marks) {
      if (mark.type === "link" && mark.attrs?.href) {
        hrefs.push(String(mark.attrs.href));
        texts.push(node.text.trim());
      }
    }
  }
  if ("content" in node && Array.isArray(node.content)) {
    for (const child of node.content) walkLinks(child, hrefs, texts);
  }
}

/** Collect link hrefs and link texts from a TipTap document. */
export function extractLinkTargets(doc: TipTapDoc | null | undefined): {
  hrefs: string[];
  texts: string[];
} {
  const hrefs: string[] = [];
  const texts: string[] = [];
  if (!doc) return { hrefs, texts };
  walkLinks(doc, hrefs, texts);
  return { hrefs, texts };
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function stripMdExt(value: string): string {
  return value.replace(/\.(md|mdx|markdown)$/i, "");
}

/** Path / filename keys used to resolve relative Markdown links. */
function pathKeysFromHref(href: string): string[] {
  const raw = normalizeKey(href);
  if (!raw || raw.startsWith("mailto:")) return [];
  let pathname = raw;
  try {
    const asUrl = raw.startsWith("http")
      ? new URL(href)
      : new URL(href.replace(/\\/g, "/"), "http://local.invalid/");
    pathname = asUrl.pathname.replace(/^\//, "");
  } catch {
    pathname = raw.replace(/\\/g, "/");
  }
  const parts = pathname.split("/").filter((p) => p && p !== "." && p !== "..");
  if (!parts.length) return [];
  const file = parts[parts.length - 1]!;
  const keys = new Set<string>();
  keys.add(normalizeKey(file));
  keys.add(normalizeKey(stripMdExt(file)));
  keys.add(normalizeKey(parts.join("/")));
  keys.add(normalizeKey(stripMdExt(parts.join("/"))));
  // docs/FOO.md → FOO
  if (parts.length >= 2) {
    keys.add(normalizeKey(parts.slice(-2).join("/")));
    keys.add(normalizeKey(stripMdExt(parts.slice(-2).join("/"))));
  }
  return [...keys].filter(Boolean);
}

function slugCandidatesFromHref(href: string): string[] {
  const raw = normalizeKey(href);
  if (!raw || raw.startsWith("mailto:")) return [];
  if (raw.startsWith("http") && !raw.includes("/p/")) {
    // External URL — still try last path segment (e.g. FOO.md on GitHub).
    return pathKeysFromHref(href);
  }
  try {
    const asUrl = raw.startsWith("http")
      ? new URL(href)
      : new URL(href.replace(/\\/g, "/"), "http://local.invalid/");
    const parts = asUrl.pathname.split("/").filter(Boolean);
    const out: string[] = [...pathKeysFromHref(href)];
    if (parts.length) {
      const last = parts[parts.length - 1]!;
      out.push(normalizeKey(last), normalizeKey(stripMdExt(last)));
    }
    // /p/{space}/{...slugs}
    const pIdx = parts.indexOf("p");
    if (pIdx >= 0 && parts.length > pIdx + 2) {
      out.push(normalizeKey(parts.slice(pIdx + 2).join("/")));
      out.push(normalizeKey(parts[parts.length - 1]!));
    }
    return [...new Set(out.filter(Boolean))];
  } catch {
    return pathKeysFromHref(href);
  }
}

function indexSpaceDocs(spaceDocs: DocumentRecord[]) {
  const bySlug = new Map<string, DocumentRecord>();
  const byTitle = new Map<string, DocumentRecord>();
  const byPath = new Map<string, DocumentRecord>();

  for (const d of spaceDocs) {
    bySlug.set(normalizeKey(d.slug), d);
    bySlug.set(normalizeKey(stripMdExt(d.slug)), d);
    byTitle.set(normalizeKey(d.title), d);
    if (d.sourcePath) {
      const norm = normalizeKey(d.sourcePath.replace(/\\/g, "/"));
      const parts = norm.split("/").filter(Boolean);
      const file = parts[parts.length - 1] ?? norm;
      for (const key of [
        norm,
        stripMdExt(norm),
        file,
        stripMdExt(file),
        parts.length >= 2 ? parts.slice(-2).join("/") : "",
        parts.length >= 2 ? stripMdExt(parts.slice(-2).join("/")) : "",
      ]) {
        const k = normalizeKey(key);
        if (k) byPath.set(k, d);
      }
    }
  }

  return { bySlug, byTitle, byPath };
}

export function matchLinkedDocuments(
  spaceDocs: DocumentRecord[],
  source: DocumentRecord,
): DocumentRecord[] {
  const { hrefs, texts } = extractLinkTargets(source.content);
  const { bySlug, byTitle, byPath } = indexSpaceDocs(spaceDocs);
  const found = new Map<string, DocumentRecord>();

  function add(doc: DocumentRecord | undefined) {
    if (doc && doc.id !== source.id) found.set(doc.id, doc);
  }

  for (const href of hrefs) {
    for (const candidate of slugCandidatesFromHref(href)) {
      add(bySlug.get(candidate));
      add(byPath.get(candidate));
    }
    // Exact slug / path as href
    const key = normalizeKey(href);
    add(bySlug.get(key));
    add(byPath.get(key));
    add(byPath.get(normalizeKey(stripMdExt(key))));
  }

  for (const text of texts) {
    add(byTitle.get(normalizeKey(text)));
  }

  return [...found.values()];
}

/** BFS over internal links starting from `root`. */
export function collectRelatedDocuments(
  spaceDocs: DocumentRecord[],
  root: DocumentRecord,
  maxDepth = MAX_LINK_DEPTH,
  maxDocs = MAX_RELATED_DOCS,
): DocumentRecord[] {
  const pages = spaceDocs.filter((d) => d.kind === "page" || d.kind === "category");
  const seen = new Set<string>([root.id]);
  const result: DocumentRecord[] = [];
  let frontier: DocumentRecord[] = [root];

  for (let depth = 0; depth < maxDepth && result.length < maxDocs; depth += 1) {
    const next: DocumentRecord[] = [];
    for (const doc of frontier) {
      for (const linked of matchLinkedDocuments(pages, doc)) {
        if (seen.has(linked.id)) continue;
        seen.add(linked.id);
        result.push(linked);
        next.push(linked);
        if (result.length >= maxDocs) break;
      }
      if (result.length >= maxDocs) break;
    }
    frontier = next;
  }

  return result;
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max - 1).trimEnd()}…`, truncated: true };
}

const STOPWORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "comment",
  "compare",
  "comparaison",
  "dans",
  "de",
  "des",
  "du",
  "en",
  "et",
  "est",
  "la",
  "le",
  "les",
  "un",
  "une",
  "ou",
  "par",
  "pas",
  "pour",
  "que",
  "qui",
  "sur",
  "the",
  "and",
  "for",
  "with",
  "what",
  "how",
  "quoi",
  "sert",
  "explique",
  "explain",
]);

const OVERVIEW_RE =
  /(demarrage|démarrage|get-started|getting-started|brand|native-first|differenciation|différenciation|readme|overview|introduction|limitations|politique)/i;

/** Lightweight lexical score — not an embedding index / RAG store. */
export function scoreDocForQuery(
  doc: DocumentRecord,
  queryTokens: string[],
  rawQuery = "",
): number {
  if (!queryTokens.length && !rawQuery) return 0;
  const title = normalizeKey(doc.title);
  const slug = normalizeKey(doc.slug);
  const path = normalizeKey(doc.sourcePath ?? "");
  const body = extractText(doc.content).toLowerCase();
  const q = normalizeKey(rawQuery);
  let score = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) score += 8;
    if (slug.includes(token)) score += 5;
    if (path.includes(token)) score += 4;
    if (body.includes(token)) score += 2;
  }

  // Prefer product overview pages for “what is / compare” questions.
  if (
    /(compare|compar|differenc|différenc|versus|\bvs\b|ollama|llama\.cpp|vllm)/i.test(
      q,
    ) &&
    OVERVIEW_RE.test(`${title} ${slug} ${path}`)
  ) {
    score += 12;
  }

  // Avoid overweighting API-compat pages when the question is not about that API.
  if (
    /anthropic/.test(title) &&
    !/anthropic|messages|claude/.test(q) &&
    /(compare|compar|differenc|différenc|versus|\bvs\b|sert|quoi)/i.test(q)
  ) {
    score -= 20;
  }

  return score;
}

export function tokenizeQuery(query: string): string[] {
  return normalizeKey(query)
    .split(/[^a-z0-9àâäéèêëïîôùûüç_+-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export function buildAiContextBundle(input: {
  scope: AiContextScope;
  spaceDocs: DocumentRecord[];
  primary: DocumentRecord | null;
  locale?: string;
  /** User question — used to rank pages when the budget truncates the Space. */
  query?: string;
}): AiContextBundle {
  const locale = input.locale;
  const rawQuery = input.query ?? "";
  const queryTokens = tokenizeQuery(rawQuery);
  const spaceDocs = input.spaceDocs.filter(
    (d) =>
      (d.kind === "page" || d.kind === "category") &&
      (!locale || d.locale === locale),
  );

  const docs: AiContextDoc[] = [];
  let truncated = false;
  let remaining = MAX_TOTAL_CHARS;

  if (input.primary) {
    const body = extractText(input.primary.content);
    const clipped = clip(body, Math.min(MAX_PRIMARY_CHARS, remaining));
    truncated = truncated || clipped.truncated;
    remaining -= clipped.text.length;
    docs.push({
      id: input.primary.id,
      title: input.primary.title,
      slug: input.primary.slug,
      text: clipped.text,
      role: "primary",
    });
  }

  const linked =
    input.scope === "page" || !input.primary
      ? []
      : collectRelatedDocuments(spaceDocs, input.primary);

  // Prefer linked pages that match the question when the budget is tight.
  const rankedLinked = [...linked].sort(
    (a, b) =>
      scoreDocForQuery(b, queryTokens, rawQuery) -
      scoreDocForQuery(a, queryTokens, rawQuery),
  );

  for (const doc of rankedLinked) {
    if (remaining < 500) {
      truncated = true;
      break;
    }
    const body = extractText(doc.content);
    const clipped = clip(body, Math.min(MAX_RELATED_CHARS, remaining));
    truncated = truncated || clipped.truncated;
    remaining -= clipped.text.length;
    docs.push({
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      text: clipped.text,
      role: "linked",
    });
  }

  if (input.scope === "space") {
    const already = new Set(docs.map((d) => d.id));
    const rest = spaceDocs
      .filter((d) => !already.has(d.id))
      .sort((a, b) => {
        const diff =
          scoreDocForQuery(b, queryTokens, rawQuery) -
          scoreDocForQuery(a, queryTokens, rawQuery);
        if (diff !== 0) return diff;
        return a.title.localeCompare(b.title);
      });

    // Prefer breadth over depth so "Space entier" covers more pages.
    const perDoc = Math.max(
      600,
      Math.min(1_400, Math.floor(remaining / Math.max(rest.length, 1))),
    );

    for (const doc of rest) {
      if (remaining < 350) {
        truncated = true;
        break;
      }
      const body = extractText(doc.content);
      const clipped = clip(body, Math.min(perDoc, remaining));
      truncated = truncated || clipped.truncated;
      remaining -= clipped.text.length;
      docs.push({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        text: clipped.text,
        role: "space",
      });
    }
  }

  return {
    docs,
    sources: docs.map((d) => d.title),
    truncated,
  };
}

export function formatAiContextForPrompt(bundle: AiContextBundle): string {
  if (bundle.docs.length === 0) return "";
  const blocks = bundle.docs.map((d) => {
    const label =
      d.role === "primary"
        ? "Page courante"
        : d.role === "linked"
          ? "Page liée"
          : "Page du Space";
    return `### ${label}: ${d.title} (slug: ${d.slug})\n${d.text || "(vide)"}`;
  });
  const footer = bundle.truncated
    ? "\n\n[Contexte tronqué pour respecter la limite de taille.]"
    : "";
  return `Contexte documentaire (seule source de vérité factuelle — cite les titres de pages):\n\n${blocks.join("\n\n")}${footer}`;
}
