import type { AiContextBundle } from "./ai-context";
import { extractText } from "./tiptap-text";
import type { DocumentRecord } from "./types";

const GENERIC = new Set([
  "comment",
  "compare",
  "comparaison",
  "comparison",
  "difference",
  "différencie",
  "differencie",
  "différenciation",
  "versus",
  "avec",
  "entre",
  "exemple",
  "example",
  "quoi",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "pour",
  "dans",
  "sur",
  "des",
  "les",
  "une",
  "est",
  "sont",
  "the",
  "and",
  "for",
  "how",
  "what",
  "with",
  "comme",
]);

/** Proper-ish tokens from the question to check against the doc context. */
export function extractFocusTerms(query: string): string[] {
  const raw = query.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_+.-]{2,}/g) ?? [];
  const out: string[] = [];
  for (const token of raw) {
    const t = token.toLowerCase();
    if (t.length < 3 || GENERIC.has(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 8);
}

function corpusFromDocs(docs: DocumentRecord[]): string {
  return docs
    .map((d) => `${d.title}\n${d.slug}\n${d.sourcePath ?? ""}\n${extractText(d.content)}`)
    .join("\n")
    .toLowerCase();
}

function corpusFromBundle(bundle: AiContextBundle): string {
  return bundle.docs.map((d) => `${d.title}\n${d.text}`).join("\n\n");
}

function snippetsForTerm(corpus: string, term: string, limit = 2): string[] {
  const lower = corpus.toLowerCase();
  const needle = term.toLowerCase();
  const found: string[] = [];
  let from = 0;
  while (found.length < limit) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) break;
    const start = Math.max(0, idx - 70);
    const end = Math.min(corpus.length, idx + needle.length + 110);
    let snip = corpus.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) snip = `…${snip}`;
    if (end < corpus.length) snip = `${snip}…`;
    found.push(snip);
    from = idx + needle.length;
  }
  return found;
}

export type TermCoverage = {
  term: string;
  present: boolean;
  snippets: string[];
};

export function analyzeTermCoverage(
  query: string,
  docs: DocumentRecord[],
): TermCoverage[] {
  const corpus = corpusFromDocs(docs);
  return extractFocusTerms(query).map((term) => {
    const present = corpus.includes(term.toLowerCase());
    return {
      term,
      present,
      snippets: present ? snippetsForTerm(corpus, term, 2) : [],
    };
  });
}

/** Compact notes for the *system* prompt only — never meant to be shown to the user. */
export function buildGroundingNotes(
  query: string,
  bundle: AiContextBundle,
  spaceName?: string,
): string {
  const corpus = corpusFromBundle(bundle);
  const terms = extractFocusTerms(query);
  const lines: string[] = [
    `Space: « ${spaceName || "courant"} ».`,
    "Ne jamais inventer éditeur/créateur. Si absent de la doc → « non documenté ici ».",
    "« Anthropic Messages API » = compatibilité API, pas éditeur Anthropic.",
    "Mention d’Ollama/llama.cpp = référence perf/ergonomie, pas filiation Meta.",
  ];

  if (!terms.length) return lines.join("\n");

  for (const term of terms) {
    const snips = snippetsForTerm(corpus, term);
    if (!snips.length) {
      lines.push(`Terme « ${term} »: absent du contexte.`);
    } else {
      lines.push(`Terme « ${term} »: ${snips[0]}`);
    }
  }
  return lines.join("\n");
}

/**
 * Local models often echo the prompt. Keep only the actual answer.
 */
export function sanitizeAiResponse(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  // Prefer explicit answer markers if the model echoed the prompt then answered.
  const markers = [
    /\nRéponse\s*:\s*/i,
    /\nAnswer\s*:\s*/i,
    /\n##\s*Réponse\b/i,
  ];
  for (const re of markers) {
    const m = text.match(re);
    if (m && m.index != null) {
      text = text.slice(m.index + m[0].length).trim();
      break;
    }
  }

  // Drop echoed instruction / context blocks from the start.
  const echoHeads = [
    /^Space\s*:/i,
    /^Page active\s*:/i,
    /^Gardes-fous/i,
    /^Contexte documentaire/i,
    /^Pages consultées\s*:/i,
    /^Documentation fournie/i,
    /^###\s*Page /i,
  ];
  if (echoHeads.some((re) => re.test(text))) {
    const demande = text.search(/\nDemande\s*:\s*/i);
    if (demande >= 0) {
      const after = text.slice(demande).replace(/^\nDemande\s*:\s*/i, "");
      // Skip the repeated question line(s), keep what follows as answer if any.
      const lines = after.split("\n");
      let i = 0;
      while (i < lines.length && !lines[i]!.trim()) i += 1;
      // skip question paragraph
      while (i < lines.length && lines[i]!.trim()) i += 1;
      while (i < lines.length && !lines[i]!.trim()) i += 1;
      const rest = lines.slice(i).join("\n").trim();
      if (rest) text = rest;
    }
  }

  // Final cleanup of leftover labels.
  text = text
    .replace(/^Rappel:[\s\S]*?(?=\n\n|\n[A-ZÀ-Ü])/i, "")
    .replace(/^Gardes-fous[\s\S]*?(?=\n\n)/i, "")
    .trim();

  return text;
}

/** Short deterministic reply when the Space simply doesn't contain the asked terms. */
export function buildMissingTermsReply(input: {
  spaceName: string;
  missing: string[];
  present: string[];
  otherSpaces?: { name: string; terms: string[] }[];
}): string {
  const missing = input.missing.map((t) => `« ${t} »`).join(", ");
  const lines = [
    `Dans le Space **${input.spaceName}**, je ne trouve pas ${missing}.`,
    "Je ne peux donc pas répondre à partir de ce Space (et je n’invente pas).",
  ];
  if (input.present.length) {
    lines.push(
      `Termes présents ici : ${input.present.map((t) => `« ${t} »`).join(", ")}.`,
    );
  }
  if (input.otherSpaces?.length) {
    lines.push("");
    lines.push("Ces termes apparaissent ailleurs :");
    for (const s of input.otherSpaces) {
      lines.push(
        `- **${s.name}** (${s.terms.map((t) => `« ${t} »`).join(", ")})`,
      );
    }
    lines.push("");
    lines.push("Ouvre le bon Space (sélecteur en haut), puis repose la question.");
  } else {
    lines.push("Vérifie le Space sélectionné, ou reformule avec des termes de la doc.");
  }
  return lines.join("\n");
}
