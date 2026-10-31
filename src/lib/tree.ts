import type { DocumentRecord, DocTreeNode } from "./types";

export function buildTree(documents: DocumentRecord[]): DocTreeNode[] {
  const byParent = new Map<string | null, DocumentRecord[]>();
  for (const doc of documents) {
    const key = doc.parentId;
    const list = byParent.get(key) ?? [];
    list.push(doc);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }

  function walk(parentId: string | null): DocTreeNode[] {
    return (byParent.get(parentId) ?? []).map((doc) => ({
      ...doc,
      children: walk(doc.id),
    }));
  }

  return walk(null);
}

export function flattenTree(nodes: DocTreeNode[]): DocumentRecord[] {
  const out: DocumentRecord[] = [];
  function walk(list: DocTreeNode[]) {
    for (const node of list) {
      const { children, ...doc } = node;
      out.push(doc);
      walk(children);
    }
  }
  walk(nodes);
  return out;
}

export function firstReadablePage(
  docs: DocumentRecord[],
): DocumentRecord | undefined {
  const tree = buildTree(docs.filter((d) => !d.hidden));
  function find(nodes: DocTreeNode[]): DocumentRecord | undefined {
    for (const n of nodes) {
      if (n.kind === "page") return n;
      const child = find(n.children);
      if (child) return child;
    }
    return undefined;
  }
  return find(tree);
}

/** Breadcrumb path of slugs from root to document (excluding the doc itself for parents). */
export function pathSlugs(
  docs: DocumentRecord[],
  documentId: string,
): string[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const chain: string[] = [];
  let current = byId.get(documentId);
  while (current) {
    chain.unshift(current.slug);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function findByPath(
  docs: DocumentRecord[],
  slugs: string[],
): DocumentRecord | undefined {
  let parentId: string | null = null;
  let found: DocumentRecord | undefined;
  for (const slug of slugs) {
    found = docs.find((d) => d.parentId === parentId && d.slug === slug);
    if (!found) return undefined;
    parentId = found.id;
  }
  return found;
}
