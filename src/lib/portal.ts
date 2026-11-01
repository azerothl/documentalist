import type { Space, Variable, TipTapNode } from "./types";
import { applyVariables } from "./tiptap-text";
export function publicPortalData(
  space: Space,
  variables: Variable[],
  locale: string,
) {
  const snapshot = space.publishedSnapshot;
  const values = Object.fromEntries(
    (snapshot?.variables ?? variables).map((v) => [v.key, v.value]),
  );
  const all = snapshot?.documents ?? [];
  const candidates = all.filter((d) => !d.hidden && d.locale === locale);
  function publicNode(node: TipTapNode): TipTapNode {
    return {
      ...node,
      ...(node.text ? { text: applyVariables(node.text, values) } : {}),
      ...(node.content ? { content: node.content.map(publicNode) } : {}),
    };
  }
  const documents = candidates
    .filter((d) => {
      let parent = d.parentId;
      const seen = new Set<string>();
      while (parent) {
        if (seen.has(parent)) return false;
        seen.add(parent);
        const p = all.find((n) => n.id === parent);
        if (!p || p.hidden) return false;
        parent = p.parentId;
      }
      return true;
    })
    .map((d) => ({
      ...d,
      title: applyVariables(d.title, values),
      seoTitle: d.seoTitle ? applyVariables(d.seoTitle, values) : null,
      seoDescription: d.seoDescription
        ? applyVariables(d.seoDescription, values)
        : null,
      content: { ...d.content, content: d.content.content?.map(publicNode) },
      parentId: candidates.some((p) => p.id === d.parentId) ? d.parentId : null,
    }));
  return {
    space: {
      id: space.id,
      name: space.name,
      slug: space.slug,
      accentColor: space.accentColor,
      locales: space.locales,
    },
    documents,
  };
}
