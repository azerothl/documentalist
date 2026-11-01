import {
  scoreDocForQuery,
  tokenizeQuery,
} from "./ai-context";
import { extractFocusTerms } from "./ai-grounding";
import { extractText } from "./tiptap-text";
import type { DocumentRecord } from "./types";

export type FocusedExcerpt = {
  title: string;
  slug: string;
  text: string;
};

export type FocusedAskContext = {
  excerpts: FocusedExcerpt[];
  sources: string[];
  block: string;
  truncated: boolean;
};

const MAX_EXCERPT_CHARS = 7_500;
const MAX_EXCERPTS = 12;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40);
}

function paragraphScore(para: string, terms: string[]): number {
  const lower = para.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!lower.includes(term)) continue;
    score += 3;
    // Prefer sentences that actually discuss the term, not just list it.
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(para)) score += 2;
  }
  if (/(native-first|gguf|daemon|ollama|llama\.cpp|vllm|bitnet-core|inference)/i.test(para)) {
    score += 2;
  }
  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tight context for Q&A: only the most relevant short excerpts.
 * Weak local models behave much better with 5–8k focused chars than a Space dump.
 */
export function buildFocusedAskContext(input: {
  spaceDocs: DocumentRecord[];
  primary: DocumentRecord | null;
  query: string;
  locale?: string;
}): FocusedAskContext {
  const locale = input.locale;
  const pages = input.spaceDocs.filter(
    (d) =>
      (d.kind === "page" || d.kind === "category") &&
      (!locale || d.locale === locale),
  );
  const queryTokens = tokenizeQuery(input.query);
  const focusTerms = extractFocusTerms(input.query);
  const terms = [...new Set([...queryTokens, ...focusTerms])];

  const rankedDocs = [...pages]
    .map((d) => ({
      doc: d,
      score: scoreDocForQuery(d, queryTokens, input.query),
    }))
    .sort((a, b) => b.score - a.score);

  const candidates: { title: string; slug: string; text: string; score: number }[] =
    [];

  if (input.primary) {
    const body = extractText(input.primary.content);
    if (body.trim()) {
      candidates.push({
        title: input.primary.title,
        slug: input.primary.slug,
        text: body.slice(0, 1_200),
        score: 100,
      });
    }
  }

  for (const { doc, score: docScore } of rankedDocs.slice(0, 20)) {
    if (input.primary && doc.id === input.primary.id) continue;
    const full = extractText(doc.content);
    const paras = splitParagraphs(full);
    const scored = paras
      .map((p) => ({ p, s: paragraphScore(p, terms) + docScore / 20 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);

    // Always keep a short lead-in from high-ranking overview pages.
    if (
      docScore >= 12 &&
      /brand|native-first|differenc|différenc|demarrage|démarrage|get-started|limitations/i.test(
        `${doc.title} ${doc.slug} ${doc.sourcePath ?? ""}`,
      )
    ) {
      const lead = (paras[0] || full).slice(0, 400).trim();
      if (lead.length >= 30) {
        candidates.push({
          title: doc.title,
          slug: doc.slug,
          text: lead,
          score: docScore + 5,
        });
      }
    }

    for (const { p, s } of scored) {
      candidates.push({
        title: doc.title,
        slug: doc.slug,
        text: p.slice(0, 700),
        score: s,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const excerpts: FocusedExcerpt[] = [];
  const seen = new Set<string>();
  let used = 0;
  let truncated = false;

  for (const c of candidates) {
    const key = `${c.slug}::${c.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    if (excerpts.length >= MAX_EXCERPTS || used + c.text.length > MAX_EXCERPT_CHARS) {
      truncated = true;
      break;
    }
    seen.add(key);
    excerpts.push({ title: c.title, slug: c.slug, text: c.text });
    used += c.text.length;
  }

  const sources = [...new Set(excerpts.map((e) => e.title))];
  const block = excerpts.length
    ? [
        "Extraits documentaires — tu dois te limiter STRICTEMENT à ceux-ci:",
        ...excerpts.map(
          (e, i) =>
            `[${i + 1}] « ${e.title} »\n${e.text}`,
        ),
      ].join("\n\n")
    : "Aucun extrait pertinent trouvé dans ce Space.";

  return { excerpts, sources, block, truncated };
}

/** Deterministic fallback when the model invents vendors / ignores excerpts. */
export function answerFromExcerpts(
  excerpts: FocusedExcerpt[],
  query: string,
): string {
  if (!excerpts.length) {
    return "Non documenté ici : aucun extrait pertinent dans ce Space.";
  }
  const lines = [
    "D’après la documentation du Space (extraits pertinents) :",
    "",
    ...excerpts.slice(0, 6).map((e) => `- **${e.title}** — ${e.text}`),
    "",
    "Les points non écrits dans ces extraits (éditeur, maison mère, filiation OpenAI/Anthropic/Meta, etc.) sont **non documentés ici**.",
  ];
  if (/ollama/i.test(query)) {
    lines.push(
      "",
      "Note : Ollama n’est mentionné dans la doc que comme référence d’ergonomie / perf / daemon externe — pas comme produit frère ni comme créateur de Rbitnet.",
    );
  }
  return lines.join("\n");
}

export function looksHallucinated(text: string): boolean {
  const t = text.toLowerCase();
  if (
    /d[eé]velopp\w*\s+par\s+(openai|anthropic|meta|google|microsoft)/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/cr[eé]+\w*\s+par\s+(openai|anthropic|meta|google)/i.test(text)) {
    return true;
  }
  if (
    /rbitnet.{0,60}(openai|anthropic)/i.test(t) &&
    /(d[eé]velopp|cr[eé]|fond[eé]|maison m[eè]re|par openai|par anthropic)/i.test(
      t,
    )
  ) {
    return true;
  }
  // Classic confusion: answering about Llama/CNN when asked about Ollama.
  if (
    /ollama/i.test(text) === false &&
    /\bllama\b/i.test(text) &&
    /cnn/i.test(t)
  ) {
    return true;
  }
  if (/ollama.{0,40}(meta|facebook|openai)/i.test(t)) return true;
  return false;
}
