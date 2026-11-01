export type DocumentKind = "page" | "category" | "link";

export type MarkdownFormat = "auto" | "commonmark" | "gfm" | "mdx" | "obsidian";

export type IntegrationProvider =
  "github" | "gitlab" | "slack" | "discord" | "openapi" | "webhook" | "notion";

export type TipTapDoc = {
  type: "doc";
  content?: TipTapNode[];
};

export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export type LlmProvider =
  | "openai"
  | "anthropic"
  | "ollama"
  | "lmstudio"
  | "vllm"
  | "compatible";

export type LlmSettings = {
  enabled: boolean;
  provider: LlmProvider;
  apiKey: string;
  /** OpenAI-compatible or Anthropic base URL */
  baseUrl: string;
  model: string;
};

export type Organization = {
  id: string;
  name: string;
  llm: LlmSettings;
};

export type Space = {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string;
  isPublic: boolean;
  accentColor: string;
  accessPassword: string | null;
  customCss: string;
  /** Shared across versioned spaces */
  versionGroupId: string;
  versionLabel: string;
  isMainVersion: boolean;
  defaultLocale: string;
  locales: string[];
  publishedAt: string | null;
  publishedSnapshot: PublishedSnapshot | null;
  /** null = inherit organization LLM settings */
  llm: LlmSettings | null;
};

export type PublishedSnapshot = {
  publishedAt: string;
  documents: DocumentRecord[];
  variables?: Variable[];
};

export type DocumentRecord = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  slug: string;
  kind: DocumentKind;
  href: string | null;
  content: TipTapDoc;
  position: number;
  hidden: boolean;
  tags: string[];
  locale: string;
  /** Source document id when this is a translation */
  translationOf: string | null;
  /** Origin path when imported (e.g. docs/guide.md) */
  sourcePath: string | null;
  markdownFormat: MarkdownFormat | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Revision = {
  id: string;
  documentId: string;
  title: string;
  content: TipTapDoc;
  createdAt: string;
};

export type Comment = {
  id: string;
  documentId: string;
  author: string;
  body: string;
  resolved: boolean;
  createdAt: string;
};

export type Variable = {
  id: string;
  orgId: string;
  key: string;
  value: string;
};

export type Snippet = {
  id: string;
  orgId: string;
  name: string;
  body: string;
};

export type Template = {
  id: string;
  orgId: string;
  name: string;
  description: string;
  content: TipTapDoc;
};

export type Integration = {
  id: string;
  orgId: string;
  provider: IntegrationProvider;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  lastSyncAt: string | null;
  createdAt: string;
};

export type StoreData = {
  schemaVersion?: number;
  organization: Organization;
  spaces: Space[];
  documents: DocumentRecord[];
  revisions: Revision[];
  comments: Comment[];
  variables: Variable[];
  snippets: Snippet[];
  templates: Template[];
  integrations: Integration[];
};

export type DocTreeNode = DocumentRecord & { children: DocTreeNode[] };

export const INTEGRATION_CATALOG: {
  provider: IntegrationProvider;
  title: string;
  description: string;
  fields: {
    key: string;
    label: string;
    secret?: boolean;
    placeholder?: string;
  }[];
}[] = [
  {
    provider: "github",
    title: "GitHub",
    description: "Importer de la doc depuis un dépôt (Markdown / MDX).",
    fields: [
      {
        key: "token",
        label: "Token d’accès (optionnel pour les dépôts publics)",
        secret: true,
        placeholder: "ghp_…",
      },
      {
        key: "defaultOwner",
        label: "Propriétaire / org par défaut",
        placeholder: "vercel",
      },
    ],
  },
  {
    provider: "gitlab",
    title: "GitLab",
    description: "Importer des fichiers Markdown depuis un dépôt GitLab.",
    fields: [
      { key: "token", label: "Token d’accès", secret: true },
      { key: "host", label: "Hôte", placeholder: "https://gitlab.com" },
    ],
  },
  {
    provider: "slack",
    title: "Slack",
    description: "Notifier un canal quand un Space est publié.",
    fields: [
      {
        key: "webhookUrl",
        label: "URL du webhook entrant",
        secret: true,
        placeholder: "https://hooks.slack.com/…",
      },
      { key: "channel", label: "Canal", placeholder: "#docs" },
    ],
  },
  {
    provider: "discord",
    title: "Discord",
    description:
      "Envoyer les événements de publication vers un webhook Discord.",
    fields: [{ key: "webhookUrl", label: "URL du webhook", secret: true }],
  },
  {
    provider: "openapi",
    title: "OpenAPI / Swagger",
    description: "Enregistrer une URL de spec pour générer des pages API.",
    fields: [
      {
        key: "specUrl",
        label: "URL OpenAPI JSON/YAML",
        placeholder: "https://…/openapi.json",
      },
    ],
  },
  {
    provider: "webhook",
    title: "Webhook générique",
    description:
      "Envoyer les événements (publish, import) en JSON vers votre endpoint.",
    fields: [
      {
        key: "url",
        label: "URL de l’endpoint",
        placeholder: "https://api.example.com/hooks/docs",
      },
      { key: "secret", label: "Secret partagé", secret: true },
    ],
  },
  {
    provider: "notion",
    title: "Notion",
    description: "Importer une page Notion partagée et ses sous-pages.",
    fields: [
      { key: "token", label: "Token d’intégration interne", secret: true },
      { key: "rootPageId", label: "ID de la page racine", placeholder: "uuid" },
    ],
  },
];
