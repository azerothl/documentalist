import { nanoid } from "nanoid";
import { repairTipTapDoc } from "./markdown";
import { richDoc } from "./tiptap-text";
import type { LlmSettings, StoreData } from "./types";

const DEFAULT_LLM: LlmSettings = {
  enabled: false,
  provider: "compatible",
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
  if (!Array.isArray(data.comments)) data.comments = [];
  if (!Array.isArray(data.templates)) data.templates = [];
  if (!Array.isArray(data.revisions)) data.revisions = [];
  if (!Array.isArray(data.variables)) data.variables = [];
  if (!Array.isArray(data.snippets)) data.snippets = [];
  if (!Array.isArray(data.integrations)) data.integrations = [];
  if (!data.organization.llm) data.organization.llm = { ...DEFAULT_LLM };

  for (const space of data.spaces) {
    if (space.accessPassword === undefined) space.accessPassword = null;
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

  return data;
}
