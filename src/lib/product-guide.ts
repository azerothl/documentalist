import { parseMarkdown } from "./markdown";
import { referencePages } from "./product-guide-reference";
import { learnPages } from "./product-guide-learn";
import type { DocumentRecord } from "./types";

export const PRODUCT_GUIDE_SPACE_ID = "spc_product";
/** Refresh official guide pages once on existing installations. */
export const PRODUCT_GUIDE_VERSION = 8;
export const productGuidePages = [...referencePages, ...learnPages];
export const productGuideDocumentIds = new Set(
  productGuidePages.flatMap((page) => [page.id, page.id + "_fr"]),
);

/** Stable legacy IDs/slugs preserve existing links; French pages link to English originals. */
export function buildProductGuideDocuments(
  spaceId: string,
  now: string,
): DocumentRecord[] {
  return productGuidePages.flatMap((page, position) =>
    (["en", "fr"] as const).map((locale): DocumentRecord => {
      const [title, ...paragraphs] = page[locale];
      const content = parseMarkdown(
        "# " + title + "\n\n" + paragraphs.join("\n\n"),
        "gfm",
      ).doc;
      return {
        id: page.id + (locale === "fr" ? "_fr" : ""),
        spaceId,
        parentId: page.parentId
          ? page.parentId + (locale === "fr" ? "_fr" : "")
          : null,
        title,
        slug: page.slug,
        kind: page.kind ?? "page",
        href: null,
        position,
        hidden: false,
        tags: ["documentalist", page.section],
        locale,
        translationOf: locale === "fr" ? page.id : null,
        sourcePath: null,
        section: page.section,
        markdownFormat: "gfm",
        seoTitle: title,
        seoDescription:
          paragraphs.find((text) => !text.startsWith("#"))?.slice(0, 160) ??
          null,
        content,
        createdAt: now,
        updatedAt: now,
      };
    }),
  );
}

export function ensureProductGuide(data: {
  organization: { productGuideVersion?: number };
  spaces: { id: string; slug: string; locales?: string[] }[];
  documents: DocumentRecord[];
}): boolean {
  if ((data.organization.productGuideVersion ?? 0) >= PRODUCT_GUIDE_VERSION)
    return false;
  const space =
    data.spaces.find((s) => s.id === PRODUCT_GUIDE_SPACE_ID) ??
    data.spaces.find((s) => s.slug === "product-docs");
  if (!space) {
    data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION;
    return false;
  }
  const now = new Date().toISOString();
  for (const guide of buildProductGuideDocuments(space.id, now)) {
    const index = data.documents.findIndex(
      (d) => d.id === guide.id && d.spaceId === space.id,
    );
    if (index < 0) data.documents.push(guide);
    else
      data.documents[index] = {
        ...guide,
        createdAt: data.documents[index].createdAt || now,
      };
  }
  space.locales = [...new Set([...(space.locales ?? []), "en", "fr"])];
  data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION;
  return true;
}
