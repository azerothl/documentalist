import { richDoc } from "./tiptap-text";
import type { DocumentRecord } from "./types";

/** Stable IDs for the built-in Product docs guide (safe to refresh on migrate). */
export const PRODUCT_GUIDE_SPACE_ID = "spc_product";

/** Increment when guide pages are rewritten so migrate refreshes existing installs once. */
export const PRODUCT_GUIDE_VERSION = 6;

const IDS = {
  welcome: "doc_welcome",
  gettingStarted: "doc_getting_started",
  concepts: "doc_concepts",
  spaces: "doc_spaces",
  editor: "doc_editor",
  publish: "doc_publish",
  ai: "doc_ai_assistant",
  imports: "doc_imports",
  tools: "doc_tools",
  settings: "doc_settings",
  team: "doc_team",
} as const;

function base(
  partial: Omit<DocumentRecord, "createdAt" | "updatedAt" | "content"> & {
    content: DocumentRecord["content"];
  },
  now: string,
): DocumentRecord {
  return {
    ...partial,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Official in-app guide for Documentalist (Product docs Space).
 * Titles for legacy pages stay English so browser tests keep matching.
 */
export function buildProductGuideDocuments(
  spaceId: string,
  now: string,
): DocumentRecord[] {
  return [
    base(
      {
        id: IDS.welcome,
        spaceId,
        parentId: null,
        title: "Welcome",
        slug: "welcome",
        kind: "page",
        href: null,
        position: 0,
        hidden: false,
        tags: ["intro"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: "Welcome to Documentalist",
        seoDescription:
          "Local knowledge portals: Spaces, editor, publish, AI, and imports.",
        content: richDoc([
          { type: "heading", level: 1, text: "Welcome to Documentalist" },
          {
            type: "paragraph",
            text: "Documentalist is a local knowledge-portal platform: Spaces, a nested document tree, a TipTap block editor, a publishable reader at /p/{slug}, team accounts, AI help, and third-party imports.",
          },
          { type: "heading", level: 2, text: "Start here" },
          {
            type: "ordered",
            items: [
              "Read Getting started → Core concepts for the vocabulary (Organization, Space, Document).",
              "Configure AI under Paramètres → IA if you want Q&A over your docs.",
              "Import existing Markdown (file, GitHub, GitLab, Notion) or an OpenAPI spec from Outils.",
              "Publish the Space when you want a reader portal snapshot.",
            ],
          },
          { type: "heading", level: 2, text: "What this guide covers" },
          {
            type: "bullet",
            items: [
              "Spaces & tree — navigation, nesting, versions, locales",
              "Editor — slash blocks, tables, callouts, variables",
              "Publishing — snapshots, portal password, hidden pages",
              "AI assistant — providers, scopes, grounded answers",
              "Imports & integrations — GitHub, GitLab, Notion, OpenAPI, webhooks",
              "Tools — templates, variables, snippets",
              "Settings & access — Space options and roles",
              "Team & backups — accounts, activity, restore",
            ],
          },
          {
            type: "callout",
            variant: "info",
            text: "Type / in the editor for the block menu. Use Outils for imports and reusable content; Paramètres for Space and AI.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.gettingStarted,
        spaceId,
        parentId: null,
        title: "Getting started",
        slug: "getting-started",
        kind: "category",
        href: null,
        position: 1,
        hidden: false,
        tags: [],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Getting started" },
          {
            type: "paragraph",
            text: "Categories group related pages in the sidebar. Convert any document to a category from the document menu. Nest how-tos under this category as your team grows.",
          },
          {
            type: "callout",
            variant: "success",
            text: "Open Core concepts next, then Spaces & tree, before configuring AI or imports.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.concepts,
        spaceId,
        parentId: IDS.gettingStarted,
        title: "Core concepts",
        slug: "core-concepts",
        kind: "page",
        href: null,
        position: 0,
        hidden: false,
        tags: ["concepts"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Core concepts" },
          { type: "heading", level: 2, text: "Organization" },
          {
            type: "paragraph",
            text: "The tenant that owns Spaces, variables, snippets, templates, and organization-level AI settings. Managed from /team for accounts and roles.",
          },
          { type: "heading", level: 2, text: "Space" },
          {
            type: "paragraph",
            text: "A documentation collection (product, API, runbook). Each Space has its own tree, accent colour, locales, version label, portal access mode (public, shared code, or invited email links), and optional AI override.",
          },
          { type: "heading", level: 2, text: "Document" },
          {
            type: "paragraph",
            text: "A page, category, or external link in a nestable tree. Edits autosave; revisions keep recent snapshots you can restore. Pages can be hidden from the public portal while remaining editable in /app.",
          },
          { type: "heading", level: 2, text: "Portal" },
          {
            type: "paragraph",
            text: "The published reader at /p/{slug}. It serves a frozen snapshot (not live drafts). Readers can switch language and version when you configure them on the Space.",
          },
          { type: "heading", level: 2, text: "Roles" },
          {
            type: "bullet",
            items: [
              "Admin — team, secrets, integrations, all Spaces",
              "Editor — write, publish, import into Spaces",
              "Viewer — read-only in /app (including unpublished drafts)",
            ],
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.spaces,
        spaceId,
        parentId: IDS.gettingStarted,
        title: "Spaces & tree",
        slug: "spaces-and-tree",
        kind: "page",
        href: null,
        position: 1,
        hidden: false,
        tags: ["ia"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Spaces & document tree" },
          {
            type: "paragraph",
            text: "Use the left sidebar to switch Spaces, create pages or categories, nest documents, and drag to reorder. On small screens, open Documents from the header; use Plus → Déplacer… if drag-and-drop is awkward.",
          },
          {
            type: "code",
            text: "Organization\n  └── Space (product-docs)\n        ├── Welcome (page)\n        └── Getting started (category)\n              ├── Core concepts\n              └── Spaces & tree",
          },
          { type: "heading", level: 2, text: "Versions" },
          {
            type: "paragraph",
            text: "Outils → Nouvelle version duplicates the Space into a new version label in the same version group. Mark one version as main. The portal can expose version switching when multiple versions exist.",
          },
          { type: "heading", level: 2, text: "Locales" },
          {
            type: "paragraph",
            text: "Set default locale and the list of locales in Paramètres → Espace. Translate a page from the document menu; each locale has its own document row linked by translationOf.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.editor,
        spaceId,
        parentId: null,
        title: "Editor",
        slug: "editor",
        kind: "page",
        href: null,
        position: 2,
        hidden: false,
        tags: ["editor"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Block editor" },
          {
            type: "paragraph",
            text: "Type / to open the slash menu. Insert headings, lists, task lists, tables, code (with syntax highlighting), quotes, dividers, images by URL, and callouts. The right panel holds the outline, comments, SEO fields, and the AI assistant.",
          },
          {
            type: "paragraph",
            text: "Product name for demos: {{product_name}}. Support email: {{support_email}}.",
          },
          { type: "heading", level: 2, text: "Autosave & revisions" },
          {
            type: "paragraph",
            text: "Content queues to save shortly after you stop typing. Conflict detection returns HTTP 409 if another write landed first — reload before retrying. Open revisions from the document chrome to restore an earlier snapshot.",
          },
          { type: "heading", level: 2, text: "Preview" },
          {
            type: "paragraph",
            text: "Toggle preview to see {{variable}} substitution and a closer portal-like reading experience without leaving the editor.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.publish,
        spaceId,
        parentId: null,
        title: "Publishing",
        slug: "publishing",
        kind: "page",
        href: null,
        position: 3,
        hidden: false,
        tags: ["publish"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Publish a Space" },
          {
            type: "paragraph",
            text: "Click Publier in the space header. Documentalist freezes the current tree and variables into a published snapshot and serves it at /p/{slug}. A dirty badge means drafts differ from the last snapshot.",
          },
          { type: "heading", level: 2, text: "Portal access" },
          {
            type: "bullet",
            items: [
              "Choose public, shared-code, or invited-email magic-link access when publishing",
              "Code access uses an HttpOnly cookie after unlock; magic-link access lasts 8 hours and can be revoked per invited address",
              "Hidden pages — excluded from the published portal but kept in /app",
            ],
          },
          {
            type: "callout",
            variant: "warning",
            text: "Publishing waits for pending autosaves. Do not close the tab while the save indicator is busy.",
          },
          { type: "heading", level: 2, text: "Webhooks" },
          {
            type: "paragraph",
            text: "Admins can configure Slack, Discord, or a generic webhook under Outils → Intégrations so publish success/failure is posted to your channel. Delivery is logged in team activity.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.ai,
        spaceId,
        parentId: null,
        title: "AI assistant",
        slug: "ai-assistant",
        kind: "page",
        href: null,
        position: 4,
        hidden: false,
        tags: ["ai"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: "AI assistant",
        seoDescription: "Configure LLM providers and ask grounded questions.",
        content: richDoc([
          { type: "heading", level: 1, text: "AI assistant" },
          {
            type: "paragraph",
            text: "The IA tab helps you ask questions, draft sections, or proofread. Answers are grounded on documentation from the current Space — not a separate vector index. Expand the panel for a wider chat view; you can chain follow-up questions in the same thread.",
          },
          { type: "heading", level: 2, text: "Where to configure" },
          {
            type: "bullet",
            items: [
              "Paramètres → IA (organisation) — default provider for every Space",
              "Paramètres → IA (espace) — optional override for this Space only",
              "Enable the toggle, pick a provider, set model (and API key when required)",
            ],
          },
          { type: "heading", level: 2, text: "Providers" },
          {
            type: "bullet",
            items: [
              "OpenAI / Anthropic — cloud APIs (key required)",
              "Ollama, LM Studio, vLLM — local OpenAI-compatible servers on localhost",
              "OpenAI-compatible — custom base URL (private hosts only if DOCUMENTALIST_PRIVATE_HOSTS allows them)",
            ],
          },
          { type: "heading", level: 2, text: "Context scopes" },
          {
            type: "ordered",
            items: [
              "Page — current document only",
              "Page + liens — current page plus internally linked pages (followed a few hops)",
              "Space entier — focused excerpts ranked for your question across the Space",
            ],
          },
          {
            type: "callout",
            variant: "warning",
            text: "The assistant searches the Space selected in the header. Asking about another product while Product docs is selected will correctly say those terms are missing — switch Space first.",
          },
          { type: "heading", level: 2, text: "Modes" },
          {
            type: "bullet",
            items: [
              "Question — Q&A with sources listed under the reply",
              "Rédiger — propose Markdown you can insert into the page",
              "Corriger — proofread selection or instructions (page context)",
            ],
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.imports,
        spaceId,
        parentId: null,
        title: "Imports & integrations",
        slug: "imports-and-integrations",
        kind: "page",
        href: null,
        position: 5,
        hidden: false,
        tags: ["import"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Imports & integrations" },
          {
            type: "paragraph",
            text: "Bring existing docs into Documentalist from Markdown files or third-party services. GitHub, GitLab, and Notion imports attach a sync source to the Space so you can relancer the sync or enable automatic refresh. Admins configure connectors under Outils → Intégrations.",
          },
          { type: "heading", level: 2, text: "Markdown file" },
          {
            type: "paragraph",
            text: "Outils → Fichier Markdown. Choose a format hint (Auto, CommonMark, GFM, MDX, Obsidian). GFM tables and task lists are repaired into editor blocks when possible. File imports are one-shot and do not create a sync source.",
          },
          { type: "heading", level: 2, text: "GitHub" },
          {
            type: "paragraph",
            text: "Outils → Depuis GitHub (or Intégrations). Imports a Markdown/MDX tree into a new Space (up to 500 files; nested folders become categories). Page order follows SUMMARY.md when present; otherwise links from README.md/index.md (BFS), then frontmatter sidebar_position/nav_order, numeric filename prefixes, and natural path sort. Optional token for private repos. Enable automatic sync in the import dialog; use Relancer sync in the workspace header anytime.",
          },
          { type: "heading", level: 2, text: "GitLab" },
          {
            type: "paragraph",
            text: "Save a GitLab connection (host + token) in Intégrations, then run import with optional auto-sync. Configurable host supports self-managed instances. Limits apply (file count); see the README for current caps.",
          },
          { type: "heading", level: 2, text: "Notion" },
          {
            type: "paragraph",
            text: "Connect a Notion integration token, then import a shared page and its children (auto-sync optional). Unsupported blocks are flagged. Notion-hosted images may expire and are not copied into local media storage.",
          },
          { type: "heading", level: 2, text: "Synchronization" },
          {
            type: "paragraph",
            text: "When a Space has an import source, editors can Relancer sync from the header or Outils → Intégrations. Automatic sync runs when you open the Space and on the chosen interval (pages matched by source path are upserted; remote removals drop previously imported pages).",
          },
          { type: "heading", level: 2, text: "OpenAPI" },
          {
            type: "paragraph",
            text: "Paste or point to a JSON/YAML OpenAPI document. Documentalist generates pages for operations, parameters, bodies, responses, and local schemas. External $ref URLs are not fetched.",
          },
          { type: "heading", level: 2, text: "Export" },
          {
            type: "paragraph",
            text: "Export the current page as Markdown from the document menu when you need a portable copy.",
          },
          {
            type: "callout",
            variant: "info",
            text: "Outbound HTTP refuses private networks by default. Operators can allow specific hosts via DOCUMENTALIST_PRIVATE_HOSTS.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.tools,
        spaceId,
        parentId: null,
        title: "Tools",
        slug: "tools",
        kind: "page",
        href: null,
        position: 6,
        hidden: false,
        tags: ["tools"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Tools menu" },
          {
            type: "paragraph",
            text: "Open Outils from the workspace header. Besides imports, you get reusable building blocks for consistent docs.",
          },
          { type: "heading", level: 2, text: "New Space & version" },
          {
            type: "bullet",
            items: [
              "Nouvel espace — empty Space in the organization",
              "Nouvelle version — clone the current Space as another version label",
            ],
          },
          { type: "heading", level: 2, text: "Templates" },
          {
            type: "paragraph",
            text: "Pick a template (for example How-to guide or API endpoint) to create a pre-structured page. Templates are organization-scoped and seeded on first install.",
          },
          { type: "heading", level: 2, text: "Variables" },
          {
            type: "paragraph",
            text: "Keys such as {{product_name}} or {{support_email}} substitute in preview and on the published portal. Manage values from the organization store; the Tools panel lists keys for quick reference.",
          },
          { type: "heading", level: 2, text: "Snippets" },
          {
            type: "paragraph",
            text: "Reusable paragraphs (callouts, disclaimers). Insert from Outils — variables inside snippets are expanded when inserted.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.settings,
        spaceId,
        parentId: null,
        title: "Settings & access",
        slug: "settings-and-access",
        kind: "page",
        href: null,
        position: 7,
        hidden: false,
        tags: ["settings"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Settings & access" },
          {
            type: "paragraph",
            text: "Paramètres opens Space options and AI configuration. Appearance (theme, font size, reading mode) lives under the account / portal preferences and is stored in the browser.",
          },
          { type: "heading", level: 2, text: "Space settings" },
          {
            type: "bullet",
            items: [
              "Name, description, accent colour",
              "Public flag and optional portal password",
              "Default locale, locale list, version label",
            ],
          },
          { type: "heading", level: 2, text: "Document SEO & visibility" },
          {
            type: "paragraph",
            text: "In the right panel → SEO, set title and description for portal metadata. Toggle Masquer sur le site public to keep a page internal.",
          },
          { type: "heading", level: 2, text: "Secrets" },
          {
            type: "paragraph",
            text: "API keys and integration tokens never round-trip to the browser in clear text. A •••••••• mask means “keep current value”; replace the field to rotate, clear it to delete.",
          },
        ]),
      },
      now,
    ),
    base(
      {
        id: IDS.team,
        spaceId,
        parentId: null,
        title: "Team & backups",
        slug: "team-and-backups",
        kind: "page",
        href: null,
        position: 8,
        hidden: false,
        tags: ["team"],
        locale: "en",
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        content: richDoc([
          { type: "heading", level: 1, text: "Team & backups" },
          {
            type: "paragraph",
            text: "Open /team as an administrator to manage accounts (admin, editor, viewer), review activity, download backups, and restore a previous store revision.",
          },
          { type: "heading", level: 2, text: "First install" },
          {
            type: "paragraph",
            text: "Visit /setup with the token from data/setup-token (or DOCUMENTALIST_SETUP_TOKEN). That creates the first admin — there is no default password.",
          },
          { type: "heading", level: 2, text: "Data files" },
          {
            type: "bullet",
            items: [
              "data/documentalist.sqlite — encrypted app state, users, sessions",
              "data/encryption.key — local key unless you supply an external one",
              "npm run data:backup — write a server-side backup file",
            ],
          },
          {
            type: "callout",
            variant: "warning",
            text: "Keep backups and the encryption key separately. Restoring a full SQLite file requires stopping the server and using the same key.",
          },
        ]),
      },
      now,
    ),
  ];
}

/** Upsert official guide pages into an existing store (Product docs Space). */
export function ensureProductGuide(data: {
  organization: { productGuideVersion?: number };
  spaces: { id: string; slug: string }[];
  documents: DocumentRecord[];
}): boolean {
  const current = data.organization.productGuideVersion ?? 0;
  if (current >= PRODUCT_GUIDE_VERSION) return false;

  const space =
    data.spaces.find((s) => s.id === PRODUCT_GUIDE_SPACE_ID) ??
    data.spaces.find((s) => s.slug === "product-docs");
  if (!space) {
    data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION;
    return false;
  }

  const now = new Date().toISOString();
  const guides = buildProductGuideDocuments(space.id, now);
  for (const guide of guides) {
    const idx = data.documents.findIndex((d) => d.id === guide.id);
    if (idx < 0) {
      data.documents.push(guide);
      continue;
    }
    const prev = data.documents[idx]!;
    data.documents[idx] = {
      ...guide,
      createdAt: prev.createdAt || guide.createdAt,
      updatedAt: now,
    };
  }
  data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION;
  return true;
}
