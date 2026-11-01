import { extractText } from "./tiptap-text";
import type { DocumentRecord, TipTapDoc } from "./types";

export function readingContent(doc: TipTapDoc, title: string): TipTapDoc {
  const first = doc.content?.[0];
  if (
    first?.type === "heading" &&
    Number(first.attrs?.level) === 1 &&
    extractText({ type: "doc", content: [first] })
      .trim()
      .toLocaleLowerCase() === title.trim().toLocaleLowerCase()
  ) {
    return { ...doc, content: doc.content?.slice(1) };
  }
  return doc;
}

export function documentTrail(
  documents: DocumentRecord[],
  id: string,
): DocumentRecord[] {
  const trail: DocumentRecord[] = [];
  const seen = new Set<string>();
  let current = documents.find((d) => d.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    trail.unshift(current);
    current = documents.find((d) => d.id === current?.parentId);
  }
  return trail;
}

export function searchExcerpt(content: TipTapDoc, query: string) {
  const text = extractText(content).replace(/\s+/g, " ");
  const index = text
    .toLocaleLowerCase()
    .indexOf(query.trim().toLocaleLowerCase());
  const start = Math.max(0, index - 50);
  return `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}`;
}
