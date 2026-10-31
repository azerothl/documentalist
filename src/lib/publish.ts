import type { DocumentRecord, Space } from "./types";

export function hasUnpublishedChanges(
  space: Space,
  documents: DocumentRecord[],
): boolean {
  if (!space.publishedSnapshot || !space.publishedAt) {
    return documents.length > 0;
  }
  const snap = space.publishedSnapshot.documents;
  if (snap.length !== documents.length) return true;

  const byId = new Map(snap.map((d) => [d.id, d]));
  for (const doc of documents) {
    const prev = byId.get(doc.id);
    if (!prev) return true;
    if (
      doc.title !== prev.title ||
      doc.slug !== prev.slug ||
      doc.kind !== prev.kind ||
      doc.hidden !== prev.hidden ||
      doc.parentId !== prev.parentId ||
      doc.position !== prev.position ||
      doc.seoTitle !== prev.seoTitle ||
      doc.seoDescription !== prev.seoDescription ||
      JSON.stringify(doc.tags ?? []) !== JSON.stringify(prev.tags ?? []) ||
      JSON.stringify(doc.content) !== JSON.stringify(prev.content)
    ) {
      return true;
    }
  }
  return false;
}
