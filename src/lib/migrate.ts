import { nanoid } from "nanoid";
import { repairTipTapDoc } from "./markdown";
import { ensureProductGuide } from "./product-guide";
import { isValidSlug, uniqueSlug } from "./slug";
import { richDoc } from "./tiptap-text";
import type { LlmSettings, SpaceImportSource, StoreData } from "./types";

function inferDocsRoot(paths: string[]): string {
  const pages = paths.filter((p) => /\.(md|mdx|markdown)$/i.test(p));
  if (!pages.length) return "docs";
  if (pages.every((p) => !p.includes("/"))) return "";
  const counts = new Map<string, number>();
  for (const p of pages) {
    const seg = p.split("/")[0] || "";
    if (!seg) continue;
    counts.set(seg, (counts.get(seg) ?? 0) + 1);
  }
  let best = "docs";
  let n = 0;
  for (const [key, value] of counts) {
    if (value > n) {
      best = key;
      n = value;
    }
  }
  return best;
}

/** Recover sync metadata for Spaces imported before importSource existed. */
function backfillImportSource(
  space: StoreData["spaces"][number],
  documents: StoreData["documents"],
): void {
  if (space.importSource) return;
  const sourced = documents.filter(
    (d) => d.spaceId === space.id && d.sourcePath,
  );
  if (!sourced.length) return;

  const desc = space.description.match(
    /^Import (github|gitlab|notion)\s*:\s*(.+?)@([^\s]+)/i,
  );
  const tag = sourced
    .flatMap((d) => d.tags ?? [])
    .find((t) => ["github", "gitlab", "notion"].includes(t.toLowerCase()));
  let provider = (desc?.[1] || tag || "").toLowerCase();
  if (!["github", "gitlab", "notion"].includes(provider)) {
    if (/^[\w.-]+\/[\w.-]+$/.test(space.name)) provider = "github";
    else return;
  }

  const repository =
    desc?.[2]?.trim() ||
    (provider === "github" && /^[\w.-]+\/[\w.-]+$/.test(space.name)
      ? space.name
      : provider === "notion"
        ? space.name
        : "");
  if (!repository) return;

  const source: SpaceImportSource = {
    provider: provider as SpaceImportSource["provider"],
    repository,
    branch: desc?.[3]?.trim() || "main",
    path: inferDocsRoot(sourced.map((d) => d.sourcePath!)),
    format: "auto",
    locale: space.defaultLocale || "en",
    autoSync: true,
    syncIntervalMinutes: 60,
    lastSyncAt: null,
    lastSyncError: null,
  };
  space.importSource = source;
}

const DEFAULT_LLM: LlmSettings = {
  enabled: false,
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

function defaultTemplates(orgId: string) {
  return [
    {
      id: `tpl_${nanoid(8)}`,
      orgId,
      name: "How-to guide",
      description: "Step-by-step tutorial skeleton",
      content: richDoc([
        { type: "heading", level: 1, text: "How to…" },
        {
          type: "paragraph",
          text: "Brief outcome the reader will achieve.",
        },
        { type: "heading", level: 2, text: "Prerequisites" },
        {
          type: "bullet",
          items: ["Account access", "Latest CLI installed"],
        },
        { type: "heading", level: 2, text: "Steps" },
        {
          type: "ordered",
          items: ["Open the workspace", "Create a Space", "Publish the portal"],
        },
        { type: "heading", level: 2, text: "Next steps" },
        { type: "paragraph", text: "Link related docs here." },
      ]),
    },
    {
      id: `tpl_${nanoid(8)}`,
      orgId,
      name: "API endpoint",
      description: "Method, path, and example",
      content: richDoc([
        { type: "heading", level: 1, text: "GET /resource" },
        { type: "paragraph", text: "Returns a resource by id." },
        { type: "heading", level: 2, text: "Request" },
        {
          type: "code",
          text: 'curl -H "Authorization: Bearer $TOKEN" \\\n  https://api.example.com/v1/resource',
        },
        { type: "heading", level: 2, text: "Response" },
        {
          type: "code",
          text: '{\n  "id": "res_123",\n  "status": "ok"\n}',
        },
      ]),
    },
  ];
}

/** Normalize older store.json shapes in place. */
export function migrateStore(data: StoreData): StoreData {
  if ((data.schemaVersion ?? 0) > 1)
    throw new Error("Version de données plus récente que l’application.");
  data.schemaVersion = 1;
  if (!Array.isArray(data.comments)) data.comments = [];
  if (!Array.isArray(data.templates)) data.templates = [];
  if (!Array.isArray(data.revisions)) data.revisions = [];
  if (!Array.isArray(data.variables)) data.variables = [];
  if (!Array.isArray(data.snippets)) data.snippets = [];
  if (!Array.isArray(data.integrations)) data.integrations = [];
  if (!data.organization.llm) data.organization.llm = { ...DEFAULT_LLM };

  for (const space of data.spaces) {
    // Legacy free-form CSS is retired; the portal supports an accent colour.
    space.customCss = "";
    if (space.accessPassword === undefined) space.accessPassword = null;
    if (!space.accessMode) {
      if (space.accessPassword) space.accessMode = "password";
      else if (space.publishedSnapshot && !space.isPublic)
        // Preserve previously hidden published portals as private instead of
        // making them public during the access-mode migration.
        space.accessMode = "magic_link";
      else space.accessMode = "public";
    }
    if (!Array.isArray(space.allowedEmails)) space.allowedEmails = [];
    else
      space.allowedEmails = [
        ...new Set(
          space.allowedEmails
            .filter((email) => typeof email === "string")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
    space.isPublic = space.accessMode === "public";
    if (space.customCss === undefined) space.customCss = "";
    if (!space.versionGroupId) space.versionGroupId = `vg_${space.id}`;
    if (!space.versionLabel) space.versionLabel = "current";
    if (space.isMainVersion === undefined) space.isMainVersion = true;
    if (!space.defaultLocale) space.defaultLocale = "en";
    if (!Array.isArray(space.locales) || space.locales.length === 0) {
      space.locales = [space.defaultLocale, "fr"].filter(
        (v, i, a) => a.indexOf(v) === i,
      );
    }
    if (space.llm === undefined) space.llm = null;
    if (space.importSource === undefined) space.importSource = null;
  }

  for (const doc of data.documents) {
    if (!Array.isArray(doc.tags)) doc.tags = [];
    if (!doc.locale) {
      const space = data.spaces.find((s) => s.id === doc.spaceId);
      doc.locale = space?.defaultLocale ?? "en";
    }
    if (doc.translationOf === undefined) doc.translationOf = null;
    if (doc.sourcePath === undefined) doc.sourcePath = null;
    if (doc.markdownFormat === undefined) doc.markdownFormat = null;
    doc.content = repairTipTapDoc(doc.content);
  }

  // Repair slugs that fail validation (e.g. trailing hyphen after length truncate).
  for (const doc of data.documents) {
    if (isValidSlug(doc.slug)) continue;
    const siblings = data.documents.filter(
      (d) =>
        d.spaceId === doc.spaceId &&
        d.parentId === doc.parentId &&
        d.locale === doc.locale &&
        d.id !== doc.id,
    );
    doc.slug = uniqueSlug(
      doc.title || doc.slug || "untitled",
      siblings.map((d) => d.slug),
    );
  }

  for (const space of data.spaces) {
    backfillImportSource(space, data.documents);
  }

  for (const snap of data.spaces) {
    if (!snap.publishedSnapshot) continue;
    for (const doc of snap.publishedSnapshot.documents) {
      if (!Array.isArray(doc.tags)) doc.tags = [];
      if (!doc.locale) doc.locale = snap.defaultLocale || "en";
      if (doc.translationOf === undefined) doc.translationOf = null;
      if (doc.sourcePath === undefined) doc.sourcePath = null;
      if (doc.markdownFormat === undefined) doc.markdownFormat = null;
      doc.content = repairTipTapDoc(doc.content);
    }
  }

  if (data.templates.length === 0) {
    data.templates.push(...defaultTemplates(data.organization.id));
  }

  // Refresh / insert the built-in Product docs guide (AI, imports, tools, …).
  if (ensureProductGuide(data)) {
    const productSpace =
      data.spaces.find((s) => s.id === "spc_product") ??
      data.spaces.find((s) => s.slug === "product-docs");
    if (productSpace?.publishedSnapshot) {
      productSpace.publishedSnapshot = {
        publishedAt: new Date().toISOString(),
        documents: data.documents.filter((d) => d.spaceId === productSpace.id),
      };
      productSpace.publishedAt = productSpace.publishedSnapshot.publishedAt;
    }
  }

  return data;
}
