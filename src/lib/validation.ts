import { z } from "zod";
import { LLM_PROVIDER_IDS } from "./llm-providers";
import type { TipTapNode, DocumentRecord, Space } from "./types";

const locale = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
export const llmSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(LLM_PROVIDER_IDS),
  apiKey: z.string().max(4096),
  baseUrl: z.string().max(2048),
  model: z.string().max(200),
});
const node: z.ZodType<TipTapNode> = z.lazy(() =>
  z.object({
    type: z.string().max(50),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    content: z.array(node).max(10000).optional(),
  }),
);
export const contentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(node).max(10000).optional(),
});
const href = z
  .string()
  .max(2048)
  .refine(
    (v) => /^(https?:\/\/|mailto:|#|\/(?!\/))/.test(v),
    "Lien non autorisé",
  )
  .nullable();
export const spacePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  isPublic: z.boolean().optional(),
  accentColor: z
    .string()
    .regex(/^#[\da-fA-F]{6}$/)
    .optional(),
  accessPassword: z.string().max(256).nullable().optional(),
  customCss: z.literal("").optional(),
  defaultLocale: locale.optional(),
  locales: z.array(locale).min(1).max(30).optional(),
  versionLabel: z.string().min(1).max(80).optional(),
  llm: llmSchema.nullable().optional(),
});
export const documentPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .optional(),
  kind: z.enum(["page", "category", "link"]).optional(),
  href: href.optional(),
  content: contentSchema.optional(),
  parentId: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  hidden: z.boolean().optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  locale: locale.optional(),
  translationOf: z.string().nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  markdownFormat: z
    .enum(["auto", "commonmark", "gfm", "mdx", "obsidian"])
    .nullable()
    .optional(),
  seoTitle: z.string().max(500).nullable().optional(),
  seoDescription: z.string().max(5000).nullable().optional(),
});

export function validateDocumentTree(
  documents: DocumentRecord[],
  spaces: Space[],
) {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const slugs = new Set<string>();
  for (const d of documents) {
    documentPatchSchema.parse(d);
    if (!spaces.some((s) => s.id === d.spaceId))
      throw new Error("Espace introuvable.");
    const siblingsKey = `${d.spaceId}:${d.parentId}:${d.locale}:${d.slug}`;
    if (slugs.has(siblingsKey))
      throw new Error("Ce slug est déjà utilisé dans ce dossier.");
    slugs.add(siblingsKey);
    const seen = new Set([d.id]);
    let parentId = d.parentId;
    while (parentId) {
      if (seen.has(parentId))
        throw new Error("Un document ne peut pas être son propre descendant.");
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent || parent.spaceId !== d.spaceId)
        throw new Error("Dossier parent invalide.");
      parentId = parent.parentId;
    }
  }
}
