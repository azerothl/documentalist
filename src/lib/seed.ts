import { nanoid } from "nanoid";
import { migrateStore } from "./migrate";
import {
  buildProductGuideDocuments,
  PRODUCT_GUIDE_SPACE_ID,
  PRODUCT_GUIDE_VERSION,
} from "./product-guide";
import { richDoc } from "./tiptap-text";
import type { DocumentRecord, StoreData } from "./types";

export function createSeedStore(): StoreData {
  const orgId = "org_demo";
  const spaceId = PRODUCT_GUIDE_SPACE_ID;
  const apiSpaceId = "spc_api";
  const now = new Date().toISOString();

  const apiCatId = "doc_api_cat";
  const authDocId = "doc_auth";

  const guideDocs = buildProductGuideDocuments(spaceId, now);

  const apiDocs: DocumentRecord[] = [
    {
      id: apiCatId,
      spaceId: apiSpaceId,
      parentId: null,
      title: "API reference",
      slug: "api-reference",
      kind: "category",
      href: null,
      position: 0,
      hidden: false,
      tags: [],
      locale: "en",
      translationOf: null,
      sourcePath: null,
      markdownFormat: null,
      seoTitle: null,
      seoDescription: null,
      createdAt: now,
      updatedAt: now,
      content: richDoc([
        { type: "heading", level: 1, text: "API reference" },
        {
          type: "paragraph",
          text: "Illustrative documentation for a fictional API, showing multi-product navigation. These example routes are not Documentalist administration endpoints.",
        },
      ]),
    },
    {
      id: authDocId,
      spaceId: apiSpaceId,
      parentId: apiCatId,
      title: "Authentication",
      slug: "authentication",
      kind: "page",
      href: null,
      position: 0,
      hidden: false,
      tags: ["api"],
      locale: "en",
      translationOf: null,
      sourcePath: null,
      markdownFormat: null,
      seoTitle: null,
      seoDescription: null,
      createdAt: now,
      updatedAt: now,
      content: richDoc([
        { type: "heading", level: 1, text: "Authentication" },
        {
          type: "paragraph",
          text: "Fictional API example: send an API key in the Authorization header. Documentalist workspace APIs use a team session; only its MCP endpoint accepts dedicated MCP Bearer keys.",
        },
        {
          type: "code",
          text: 'curl -H "Authorization: Bearer YOUR_KEY" \\\n  https://api.example.com/v1/spaces',
        },
      ]),
    },
  ];

  const documents = [...guideDocs, ...apiDocs];

  const seed: StoreData = {
    organization: {
      id: orgId,
      name: "Acme Docs",
      productGuideVersion: PRODUCT_GUIDE_VERSION,
      llm: {
        enabled: false,
        provider: "openai",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      },
    },
    spaces: [
      {
        id: spaceId,
        orgId,
        name: "Product docs",
        slug: "product-docs",
        description: "Guides and concepts for Documentalist",
        isPublic: true,
        accessMode: "public",
        allowedEmails: [],
        accentColor: "#1F425B",
        accessPassword: null,
        customCss: "",
        versionGroupId: "vg_product",
        versionLabel: "current",
        isMainVersion: true,
        defaultLocale: "en",
        locales: ["en", "fr"],
        publishedAt: now,
        publishedSnapshot: {
          publishedAt: now,
          documents: documents.filter((d) => d.spaceId === spaceId),
        },
        llm: null,
        importSource: null,
      },
      {
        id: apiSpaceId,
        orgId,
        name: "API docs",
        slug: "api-docs",
        description: "HTTP API reference",
        isPublic: true,
        accessMode: "public",
        allowedEmails: [],
        accentColor: "#4F7E93",
        accessPassword: null,
        customCss: "",
        versionGroupId: "vg_api",
        versionLabel: "current",
        isMainVersion: true,
        defaultLocale: "en",
        locales: ["en", "fr"],
        publishedAt: now,
        publishedSnapshot: {
          publishedAt: now,
          documents: documents.filter((d) => d.spaceId === apiSpaceId),
        },
        llm: null,
        importSource: null,
      },
    ],
    documents,
    revisions: [],
    comments: [
      {
        id: `cmt_${nanoid(8)}`,
        documentId: "doc_welcome",
        author: "Alex",
        body: "Add a short GIF of the slash menu here.",
        resolved: false,
        createdAt: now,
      },
    ],
    variables: [
      {
        id: nanoid(10),
        orgId,
        key: "product_name",
        value: "Documentalist",
      },
      {
        id: nanoid(10),
        orgId,
        key: "product_slug",
        value: "product-docs",
      },
      {
        id: nanoid(10),
        orgId,
        key: "support_email",
        value: "docs@acme.example",
      },
    ],
    snippets: [
      {
        id: nanoid(10),
        orgId,
        name: "Need help callout",
        body: "Need help? Contact the documentation maintainer at {{support_email}}.",
      },
    ],
    templates: [],
    integrations: [],
  };

  return migrateStore(seed);
}
