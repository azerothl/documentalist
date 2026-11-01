import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { fetchGithubMarkdownFiles } from "./github";
import { dispatchPublishHooks, importOpenApiAsMarkdown } from "./integrations";
import { parseMarkdown, repairTipTapDoc } from "./markdown";
import { migrateStore } from "./migrate";
import { createSeedStore } from "./seed";
import { uniqueSlug, slugify } from "./slug";
import { emptyDoc } from "./tiptap-text";
import { database, encrypt, decrypt, dataDirectory } from "./database";
import { hashPassword } from "./auth";
import { SECRET_MASK, mergeSecrets } from "./secrets";
import {
  spacePatchSchema,
  documentPatchSchema,
  validateDocumentTree,
} from "./validation";
import type {
  Comment,
  DocumentKind,
  DocumentRecord,
  Integration,
  IntegrationProvider,
  LlmSettings,
  MarkdownFormat,
  Organization,
  Revision,
  Snippet,
  Space,
  StoreData,
  Template,
  TipTapDoc,
  Variable,
} from "./types";

const DATA_DIR = dataDirectory;
const STORE_PATH = path.join(DATA_DIR, "store.json");

const shared = globalThis as typeof globalThis & {
  documentalistWrites?: Promise<void>;
};
const revisions = new WeakMap<StoreData, number>();

async function ensureStore(): Promise<StoreData> {
  const db = database();
  let row = db
    .prepare("SELECT revision,payload FROM state WHERE id=1")
    .get() as { revision: number; payload: string } | undefined;
  if (!row) {
    let legacy: string | undefined;
    try {
      legacy = await fs.readFile(STORE_PATH, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // A corrupt legacy file is reported; it is never silently replaced by demo data.
    const initial = legacy
      ? (JSON.parse(legacy) as StoreData)
      : createSeedStore();
    migrateStore(initial);
    for (const s of initial.spaces)
      if (s.accessPassword && !s.accessPassword.startsWith("scrypt:"))
        s.accessPassword = hashPassword(s.accessPassword);
    const payload = encrypt(JSON.stringify(initial));
    db.prepare("INSERT OR IGNORE INTO state VALUES (1,0,?)").run(payload);
    if (legacy) {
      await fs.writeFile(
        path.join(DATA_DIR, "legacy-backup.enc"),
        encrypt(legacy),
        { mode: 0o600 },
      );
      await fs.unlink(STORE_PATH).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    row = db.prepare("SELECT revision,payload FROM state WHERE id=1").get() as {
      revision: number;
      payload: string;
    };
  }
  const data = JSON.parse(decrypt(row.payload)) as StoreData;
  revisions.set(data, row.revision);
  return data;
}

async function persist(data: StoreData): Promise<void> {
  validateDocumentTree(data.documents, data.spaces);
  const db = database();
  const version = revisions.get(data);
  db.transaction(() => {
    const row = db
      .prepare("SELECT revision,payload FROM state WHERE id=1")
      .get() as { revision: number; payload: string };
    if (version !== row.revision)
      throw new Error("Conflit d’écriture : rechargez avant de réessayer.");
    db.prepare(
      "INSERT OR IGNORE INTO state_backups(revision,payload) VALUES (?,?)",
    ).run(row.revision, row.payload);
    db.prepare("UPDATE state SET payload=?,revision=revision+1 WHERE id=1").run(
      encrypt(JSON.stringify(data)),
    );
    db.prepare("DELETE FROM state_backups WHERE revision < ?").run(
      row.revision - 19,
    );
  })();
  revisions.set(data, (version ?? 0) + 1);
}

function enqueue<T>(fn: (data: StoreData) => Promise<T> | T): Promise<T> {
  const run = (shared.documentalistWrites ?? Promise.resolve()).then(
    async () => {
      const data = await ensureStore();
      return fn(data);
    },
  );
  shared.documentalistWrites = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function newSpaceFields(
  partial: Partial<Space> & Pick<Space, "id" | "orgId" | "name" | "slug">,
): Space {
  const versionGroupId = partial.versionGroupId ?? `vg_${partial.id}`;
  return {
    description: "",
    isPublic: false,
    accentColor: "#0F6E56",
    accessPassword: null,
    customCss: "",
    versionGroupId,
    versionLabel: "current",
    isMainVersion: true,
    defaultLocale: "en",
    locales: ["en", "fr"],
    publishedAt: null,
    publishedSnapshot: null,
    llm: null,
    ...partial,
  };
}

export async function readStore(): Promise<StoreData> {
  return enqueue(async (data) => {
    const before = JSON.stringify(data);
    const migrated = migrateStore(data);
    if (JSON.stringify(migrated) !== before) {
      await persist(migrated);
    }
    return structuredClone(migrated);
  });
}

export async function listSpaces(): Promise<Space[]> {
  const data = await readStore();
  return data.spaces;
}

export async function getSpace(idOrSlug: string): Promise<Space | undefined> {
  const data = await readStore();
  return data.spaces.find((s) => s.id === idOrSlug || s.slug === idOrSlug);
}

export async function createSpace(input: {
  name: string;
  description?: string;
  defaultLocale?: string;
  locales?: string[];
}): Promise<Space> {
  return enqueue(async (data) => {
    migrateStore(data);
    const id = `spc_${nanoid(8)}`;
    const slug = uniqueSlug(
      input.name,
      data.spaces.map((s) => s.slug),
    );
    const locale = input.defaultLocale ?? "en";
    const space = newSpaceFields({
      id,
      orgId: data.organization.id,
      name: input.name,
      slug,
      description: input.description ?? "",
      defaultLocale: locale,
      locales:
        input.locales ?? [locale, "fr"].filter((v, i, a) => a.indexOf(v) === i),
    });
    data.spaces.push(space);
    data.documents.push({
      id: `doc_${nanoid(8)}`,
      spaceId: space.id,
      parentId: null,
      title: "Welcome",
      slug: "welcome",
      kind: "page",
      href: null,
      content: emptyDoc(),
      position: 0,
      hidden: false,
      tags: [],
      locale,
      translationOf: null,
      sourcePath: null,
      markdownFormat: null,
      seoTitle: null,
      seoDescription: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await persist(data);
    return structuredClone(space);
  });
}

export async function updateSpace(
  id: string,
  patch: Partial<
    Pick<
      Space,
      | "name"
      | "description"
      | "isPublic"
      | "accentColor"
      | "accessPassword"
      | "customCss"
      | "defaultLocale"
      | "locales"
      | "versionLabel"
      | "llm"
    >
  >,
): Promise<Space | undefined> {
  return enqueue(async (data) => {
    const space = data.spaces.find((s) => s.id === id);
    if (!space) return undefined;
    migrateStore(data);
    patch = spacePatchSchema.parse(patch);
    if (patch.accessPassword === SECRET_MASK) delete patch.accessPassword;
    else if (patch.accessPassword)
      patch.accessPassword = hashPassword(patch.accessPassword);
    if (patch.llm)
      patch.llm = mergeSecrets(space.llm ?? data.organization.llm, patch.llm);
    Object.assign(space, patch);
    if (patch.defaultLocale && !space.locales.includes(patch.defaultLocale)) {
      space.locales = [...space.locales, patch.defaultLocale];
    }
    await persist(data);
    return structuredClone(space);
  });
}

export async function updateOrganization(
  patch: Partial<Pick<Organization, "name" | "llm">>,
): Promise<Organization> {
  return enqueue(async (data) => {
    migrateStore(data);
    if (patch.name !== undefined) data.organization.name = patch.name;
    if (patch.llm !== undefined) {
      data.organization.llm = mergeSecrets(data.organization.llm, patch.llm);
    }
    await persist(data);
    return structuredClone(data.organization);
  });
}

export function resolveLlmSettings(
  data: StoreData,
  spaceId?: string,
): LlmSettings {
  migrateStore(data);
  const org = data.organization.llm;
  if (!spaceId) return org;
  const space = data.spaces.find((s) => s.id === spaceId);
  if (
    space?.llm?.enabled ||
    (space?.llm?.apiKey && space.llm.apiKey.length > 0)
  ) {
    return {
      ...org,
      ...space.llm,
      enabled: space.llm.enabled ?? org.enabled,
    };
  }
  return org;
}

export async function listDocuments(
  spaceId: string,
): Promise<DocumentRecord[]> {
  const data = await readStore();
  return data.documents.filter((d) => d.spaceId === spaceId);
}

export async function getDocument(
  id: string,
): Promise<DocumentRecord | undefined> {
  const data = await readStore();
  return data.documents.find((d) => d.id === id);
}

export async function createDocument(input: {
  spaceId: string;
  title: string;
  parentId?: string | null;
  kind?: DocumentKind;
  content?: TipTapDoc;
  href?: string | null;
  locale?: string;
  translationOf?: string | null;
  sourcePath?: string | null;
  markdownFormat?: MarkdownFormat | null;
  tags?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}): Promise<DocumentRecord> {
  return enqueue(async (data) => {
    migrateStore(data);
    const space = data.spaces.find((s) => s.id === input.spaceId);
    const locale = input.locale ?? space?.defaultLocale ?? "en";
    const siblings = data.documents.filter(
      (d) =>
        d.spaceId === input.spaceId &&
        d.parentId === (input.parentId ?? null) &&
        d.locale === locale,
    );
    const slug = uniqueSlug(
      input.title,
      siblings.map((d) => d.slug),
    );
    const maxPos = siblings.reduce((m, d) => Math.max(m, d.position), -1);
    const doc: DocumentRecord = {
      id: `doc_${nanoid(8)}`,
      spaceId: input.spaceId,
      parentId: input.parentId ?? null,
      title: input.title,
      slug,
      kind: input.kind ?? "page",
      href: input.href ?? null,
      content: input.content ?? emptyDoc(),
      position: maxPos + 1,
      hidden: false,
      tags: input.tags ?? [],
      locale,
      translationOf: input.translationOf ?? null,
      sourcePath: input.sourcePath ?? null,
      markdownFormat: input.markdownFormat ?? null,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.documents.push(doc);
    await persist(data);
    return structuredClone(doc);
  });
}

export async function updateDocument(
  id: string,
  patch: Partial<
    Pick<
      DocumentRecord,
      | "title"
      | "slug"
      | "kind"
      | "href"
      | "content"
      | "parentId"
      | "position"
      | "hidden"
      | "tags"
      | "locale"
      | "translationOf"
      | "sourcePath"
      | "markdownFormat"
      | "seoTitle"
      | "seoDescription"
    >
  >,
  options?: { revision?: boolean; expectedUpdatedAt?: string },
): Promise<DocumentRecord | undefined> {
  return enqueue(async (data) => {
    migrateStore(data);
    const doc = data.documents.find((d) => d.id === id);
    if (!doc) return undefined;
    if (
      options?.expectedUpdatedAt &&
      options.expectedUpdatedAt !== doc.updatedAt
    )
      throw new Error(
        "Conflit : ce document a été modifié par une autre personne. Rechargez-le avant de réessayer.",
      );
    patch = documentPatchSchema.parse(patch);

    if (options?.revision && patch.content) {
      const rev: Revision = {
        id: `rev_${nanoid(8)}`,
        documentId: doc.id,
        title: doc.title,
        content: structuredClone(doc.content),
        createdAt: new Date().toISOString(),
      };
      data.revisions.unshift(rev);
      const mine = data.revisions
        .filter((r) => r.documentId === doc.id)
        .slice(0, 30);
      const others = data.revisions.filter((r) => r.documentId !== doc.id);
      data.revisions = [...mine, ...others];
    }

    Object.assign(doc, patch);
    if (!Array.isArray(doc.tags)) doc.tags = [];
    doc.updatedAt = new Date(
      Math.max(Date.now(), Date.parse(doc.updatedAt) + 1),
    ).toISOString();
    await persist(data);
    return structuredClone(doc);
  });
}

export async function reorderDocuments(
  spaceId: string,
  orderedIds: string[],
  parentId: string | null,
): Promise<DocumentRecord[]> {
  return enqueue(async (data) => {
    migrateStore(data);
    orderedIds.forEach((id, index) => {
      const doc = data.documents.find(
        (d) => d.id === id && d.spaceId === spaceId,
      );
      if (!doc) return;
      doc.parentId = parentId;
      doc.position = index;
      doc.updatedAt = new Date().toISOString();
    });
    await persist(data);
    return structuredClone(data.documents.filter((d) => d.spaceId === spaceId));
  });
}

export async function deleteDocument(id: string): Promise<boolean> {
  return enqueue(async (data) => {
    const ids = new Set<string>();
    function collect(target: string) {
      ids.add(target);
      for (const d of data.documents) {
        if (d.parentId === target) collect(d.id);
      }
    }
    if (!data.documents.some((d) => d.id === id)) return false;
    collect(id);
    data.documents = data.documents.filter((d) => !ids.has(d.id));
    data.revisions = data.revisions.filter((r) => !ids.has(r.documentId));
    data.comments = (data.comments ?? []).filter((c) => !ids.has(c.documentId));
    await persist(data);
    return true;
  });
}

export async function listRevisions(documentId: string): Promise<Revision[]> {
  const data = await readStore();
  return data.revisions.filter((r) => r.documentId === documentId);
}

export async function restoreRevision(
  documentId: string,
  revisionId: string,
): Promise<DocumentRecord | undefined> {
  return enqueue(async (data) => {
    const doc = data.documents.find((d) => d.id === documentId);
    const rev = data.revisions.find(
      (r) => r.id === revisionId && r.documentId === documentId,
    );
    if (!doc || !rev) return undefined;

    data.revisions.unshift({
      id: `rev_${nanoid(8)}`,
      documentId: doc.id,
      title: doc.title,
      content: structuredClone(doc.content),
      createdAt: new Date().toISOString(),
    });

    doc.title = rev.title;
    doc.content = structuredClone(rev.content);
    doc.updatedAt = new Date().toISOString();
    await persist(data);
    return structuredClone(doc);
  });
}

export async function createSpaceVersion(
  spaceId: string,
  label: string,
): Promise<Space | undefined> {
  return enqueue(async (data) => {
    migrateStore(data);
    const source = data.spaces.find((s) => s.id === spaceId);
    if (!source) return undefined;
    const versionLabel = label.trim() || "v1.0";
    const id = `spc_${nanoid(8)}`;
    const slug = uniqueSlug(
      `${source.slug}-${slugify(versionLabel)}`,
      data.spaces.map((s) => s.slug),
    );
    const clone = newSpaceFields({
      ...structuredClone(source),
      id,
      slug,
      name: `${source.name} (${versionLabel})`,
      versionGroupId: source.versionGroupId,
      versionLabel,
      isMainVersion: false,
      publishedAt: null,
      publishedSnapshot: null,
    });
    data.spaces.push(clone);

    const idMap = new Map<string, string>();
    const sourceDocs = data.documents
      .filter((d) => d.spaceId === source.id)
      .sort((a, b) => a.position - b.position);

    for (const doc of sourceDocs) {
      idMap.set(doc.id, `doc_${nanoid(8)}`);
    }
    for (const doc of sourceDocs) {
      data.documents.push({
        ...structuredClone(doc),
        id: idMap.get(doc.id)!,
        spaceId: clone.id,
        parentId: doc.parentId ? (idMap.get(doc.parentId) ?? null) : null,
        translationOf: doc.translationOf
          ? (idMap.get(doc.translationOf) ?? null)
          : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await persist(data);
    return structuredClone(clone);
  });
}

export async function createTranslation(
  documentId: string,
  locale: string,
): Promise<DocumentRecord | undefined> {
  return enqueue(async (data) => {
    migrateStore(data);
    const source = data.documents.find((d) => d.id === documentId);
    if (!source) return undefined;
    const space = data.spaces.find((s) => s.id === source.spaceId);
    if (!space) return undefined;
    if (!space.locales.includes(locale)) {
      space.locales = [...space.locales, locale];
    }
    const existing = data.documents.find(
      (d) =>
        d.spaceId === source.spaceId &&
        d.locale === locale &&
        (d.translationOf === source.id ||
          (source.translationOf && d.translationOf === source.translationOf) ||
          d.id === source.translationOf),
    );
    if (existing) return structuredClone(existing);

    const rootId = source.translationOf ?? source.id;
    const sourceParent = data.documents.find((d) => d.id === source.parentId);
    const parentRoot = sourceParent?.translationOf ?? sourceParent?.id;
    const translatedParent = parentRoot
      ? data.documents.find(
          (d) =>
            d.spaceId === source.spaceId &&
            d.locale === locale &&
            (d.id === parentRoot || d.translationOf === parentRoot),
        )
      : undefined;
    const parentId = translatedParent?.id ?? null;
    const siblings = data.documents.filter(
      (d) =>
        d.spaceId === source.spaceId &&
        d.parentId === parentId &&
        d.locale === locale,
    );
    const doc: DocumentRecord = {
      ...structuredClone(source),
      id: `doc_${nanoid(8)}`,
      parentId,
      locale,
      translationOf: rootId,
      title: `${source.title} (${locale})`,
      slug: uniqueSlug(
        `${source.slug}-${locale}`,
        siblings.map((d) => d.slug),
      ),
      position: siblings.reduce((m, d) => Math.max(m, d.position), -1) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.documents.push(doc);
    await persist(data);
    return structuredClone(doc);
  });
}

export async function publishSpace(
  spaceId: string,
  portalBaseUrl?: string,
): Promise<Space | undefined> {
  return enqueue(async (data) => {
    migrateStore(data);
    const space = data.spaces.find((s) => s.id === spaceId);
    if (!space) return undefined;
    const docs = data.documents.filter((d) => d.spaceId === spaceId);
    const publishedAt = new Date().toISOString();
    space.isPublic = true;
    space.publishedAt = publishedAt;
    space.publishedSnapshot = {
      publishedAt,
      documents: structuredClone(docs),
      variables: structuredClone(data.variables),
    };
    await persist(data);

    const portalUrl =
      portalBaseUrl ??
      `${process.env.DOCUMENTALIST_URL || "http://localhost:3000"}/p/${space.slug}`;
    await dispatchPublishHooks(data.integrations, space, portalUrl);

    return structuredClone(space);
  });
}

export async function listVariables(): Promise<Variable[]> {
  const data = await readStore();
  return data.variables;
}

export async function upsertVariable(
  key: string,
  value: string,
): Promise<Variable> {
  return enqueue(async (data) => {
    const existing = data.variables.find((v) => v.key === key);
    if (existing) {
      existing.value = value;
      await persist(data);
      return structuredClone(existing);
    }
    const variable: Variable = {
      id: `var_${nanoid(8)}`,
      orgId: data.organization.id,
      key,
      value,
    };
    data.variables.push(variable);
    await persist(data);
    return structuredClone(variable);
  });
}

export async function listSnippets(): Promise<Snippet[]> {
  const data = await readStore();
  return data.snippets;
}

export async function listTemplates(): Promise<Template[]> {
  const data = await readStore();
  return data.templates;
}

export async function listIntegrations(): Promise<Integration[]> {
  const data = await readStore();
  return data.integrations;
}

export async function upsertIntegration(input: {
  id?: string;
  provider: IntegrationProvider;
  name: string;
  enabled?: boolean;
  config: Record<string, string>;
}): Promise<Integration> {
  return enqueue(async (data) => {
    migrateStore(data);
    if (input.id) {
      const existing = data.integrations.find((i) => i.id === input.id);
      if (existing) {
        existing.name = input.name;
        existing.enabled = input.enabled ?? existing.enabled;
        existing.config = mergeSecrets(existing.config, input.config);
        await persist(data);
        return structuredClone(existing);
      }
    }
    const integration: Integration = {
      id: `int_${nanoid(8)}`,
      orgId: data.organization.id,
      provider: input.provider,
      name: input.name,
      enabled: input.enabled ?? true,
      config: input.config,
      lastSyncAt: null,
      createdAt: new Date().toISOString(),
    };
    data.integrations.push(integration);
    await persist(data);
    return structuredClone(integration);
  });
}

export async function deleteIntegration(id: string): Promise<boolean> {
  return enqueue(async (data) => {
    const before = data.integrations.length;
    data.integrations = data.integrations.filter((i) => i.id !== id);
    await persist(data);
    return data.integrations.length < before;
  });
}

export async function listComments(documentId: string): Promise<Comment[]> {
  const data = await readStore();
  return (data.comments ?? []).filter((c) => c.documentId === documentId);
}

export async function addComment(input: {
  documentId: string;
  author: string;
  body: string;
}): Promise<Comment> {
  return enqueue(async (data) => {
    migrateStore(data);
    if (!data.documents.some((d) => d.id === input.documentId))
      throw new Error("Document introuvable.");
    const comment: Comment = {
      id: `cmt_${nanoid(8)}`,
      documentId: input.documentId,
      author: input.author.trim() || "You",
      body: input.body.trim(),
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    data.comments.unshift(comment);
    await persist(data);
    return structuredClone(comment);
  });
}

export async function updateComment(
  id: string,
  patch: Partial<Pick<Comment, "resolved" | "body">>,
): Promise<Comment | undefined> {
  return enqueue(async (data) => {
    migrateStore(data);
    const comment = data.comments.find((c) => c.id === id);
    if (!comment) return undefined;
    if (patch.resolved !== undefined) comment.resolved = patch.resolved;
    if (patch.body !== undefined) comment.body = patch.body;
    await persist(data);
    return structuredClone(comment);
  });
}

export async function importGithubRepo(input: {
  repository: string;
  branch?: string;
  path?: string;
  token?: string | null;
  spaceName?: string;
  format?: MarkdownFormat;
  locale?: string;
}): Promise<{ space: Space; imported: number; skipped: number }> {
  const github = await fetchGithubMarkdownFiles({
    repository: input.repository,
    branch: input.branch,
    path: input.path,
    token: input.token,
  });

  return importRepositoryFiles({ ...input, provider: "github" }, github);
}

export async function importRepositoryFiles(
  input: {
    path?: string;
    spaceName?: string;
    locale?: string;
    format?: MarkdownFormat;
    provider: string;
  },
  github: {
    owner: string;
    repo: string;
    branch: string;
    files: { path: string; content: string }[];
  },
) {
  return enqueue(async (data) => {
    migrateStore(data);
    const id = `spc_${nanoid(8)}`;
    const name = input.spaceName?.trim() || `${github.owner}/${github.repo}`;
    const slug = uniqueSlug(
      name,
      data.spaces.map((s) => s.slug),
    );
    const locale = input.locale ?? "en";
    const space = newSpaceFields({
      id,
      orgId: data.organization.id,
      name,
      slug,
      description: `Import ${input.provider} : ${github.owner}/${github.repo}@${github.branch}`,
      defaultLocale: locale,
      locales: [locale, "fr"].filter((v, i, a) => a.indexOf(v) === i),
    });
    data.spaces.push(space);

    const folderIds = new Map<string, string>();
    let imported = 0;
    let skipped = 0;

    const rootPrefix = (input.path ?? "docs").replace(/^\/+|\/+$/g, "");

    function ensureFolder(dirPath: string, parentId: string | null): string {
      if (!dirPath || dirPath === ".") {
        return parentId ?? "";
      }
      if (folderIds.has(dirPath)) return folderIds.get(dirPath)!;
      const parentPath = dirPath.includes("/")
        ? dirPath.slice(0, dirPath.lastIndexOf("/"))
        : "";
      const parent =
        parentPath && parentPath !== rootPrefix
          ? ensureFolder(parentPath, parentId)
          : parentId;
      const title = dirPath.split("/").pop() || dirPath;
      const folderId = `doc_${nanoid(8)}`;
      const siblings = data.documents.filter(
        (d) =>
          d.spaceId === space.id &&
          d.parentId === (parent || null) &&
          d.locale === locale,
      );
      data.documents.push({
        id: folderId,
        spaceId: space.id,
        parentId: parent || null,
        title,
        slug: uniqueSlug(
          title,
          siblings.map((d) => d.slug),
        ),
        kind: "category",
        href: null,
        content: emptyDoc(),
        position: siblings.length,
        hidden: false,
        tags: [input.provider],
        locale,
        translationOf: null,
        sourcePath: dirPath,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      folderIds.set(dirPath, folderId);
      return folderId;
    }

    for (const file of github.files) {
      try {
        const parsed = parseMarkdown(file.content, input.format ?? "auto");
        const base = file.path.split("/").pop() || file.path;
        const title =
          parsed.frontmatter.title ||
          parsed.titleFromHeading ||
          base.replace(/\.(md|mdx|markdown)$/i, "");
        const dir = file.path.includes("/")
          ? file.path.slice(0, file.path.lastIndexOf("/"))
          : "";
        const parentId =
          dir && dir !== rootPrefix ? ensureFolder(dir, null) : null;
        const siblings = data.documents.filter(
          (d) =>
            d.spaceId === space.id &&
            d.parentId === parentId &&
            d.locale === locale,
        );
        const tags = parsed.frontmatter.tags
          ? parsed.frontmatter.tags.split(/[,\s]+/).filter(Boolean)
          : [input.provider];
        data.documents.push({
          id: `doc_${nanoid(8)}`,
          spaceId: space.id,
          parentId,
          title,
          slug: uniqueSlug(
            title,
            siblings.map((d) => d.slug),
          ),
          kind: "page",
          href: null,
          content: repairTipTapDoc(parsed.doc),
          position: siblings.length,
          hidden: false,
          tags,
          locale,
          translationOf: null,
          sourcePath: file.path,
          markdownFormat: parsed.format,
          seoTitle: parsed.frontmatter.title ?? null,
          seoDescription:
            parsed.frontmatter.description ||
            parsed.frontmatter.summary ||
            null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    if (imported === 0) {
      data.documents.push({
        id: `doc_${nanoid(8)}`,
        spaceId: space.id,
        parentId: null,
        title: "No Markdown found",
        slug: "no-markdown-found",
        kind: "page",
        href: null,
        content: emptyDoc(),
        position: 0,
        hidden: false,
        tags: [],
        locale,
        translationOf: null,
        sourcePath: null,
        markdownFormat: null,
        seoTitle: null,
        seoDescription: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const ghIntegration = data.integrations.find(
      (i) => i.provider === input.provider,
    );
    if (ghIntegration) {
      ghIntegration.lastSyncAt = new Date().toISOString();
    }

    await persist(data);
    return { space: structuredClone(space), imported, skipped };
  });
}

export async function importOpenApiIntegration(
  spaceId: string,
  specUrl: string,
): Promise<{ imported: number }> {
  const pages = await importOpenApiAsMarkdown(specUrl);
  return enqueue(async (data) => {
    migrateStore(data);
    const space = data.spaces.find((s) => s.id === spaceId);
    if (!space) throw new Error("Space not found");
    const locale = space.defaultLocale;
    let imported = 0;
    for (const page of pages) {
      const parsed = parseMarkdown(page.markdown, "gfm");
      const siblings = data.documents.filter(
        (d) =>
          d.spaceId === spaceId && d.parentId === null && d.locale === locale,
      );
      data.documents.push({
        id: `doc_${nanoid(8)}`,
        spaceId,
        parentId: null,
        title: page.title,
        slug: uniqueSlug(
          page.title,
          siblings.map((d) => d.slug),
        ),
        kind: "page",
        href: null,
        content: repairTipTapDoc(parsed.doc),
        position: siblings.length + imported,
        hidden: false,
        tags: ["openapi"],
        locale,
        translationOf: null,
        sourcePath: specUrl,
        markdownFormat: "gfm",
        seoTitle: null,
        seoDescription: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      imported += 1;
    }
    const integration = data.integrations.find((i) => i.provider === "openapi");
    if (integration) integration.lastSyncAt = new Date().toISOString();
    await persist(data);
    return { imported };
  });
}

export async function searchDocuments(
  query: string,
  options?: { spaceId?: string; publishedOnly?: boolean; locale?: string },
): Promise<{ document: DocumentRecord; space: Space; snippet: string }[]> {
  const data = await readStore();
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { extractText } = await import("./tiptap-text");
  const results: { document: DocumentRecord; space: Space; snippet: string }[] =
    [];

  for (const space of data.spaces) {
    if (options?.spaceId && space.id !== options.spaceId) continue;
    const docs =
      options?.publishedOnly && space.publishedSnapshot
        ? space.publishedSnapshot.documents
        : data.documents.filter((d) => d.spaceId === space.id);

    if (options?.publishedOnly && !space.publishedSnapshot) continue;

    for (const doc of docs) {
      if (doc.kind === "link") continue;
      if (options?.publishedOnly && doc.hidden) continue;
      if (options?.locale && doc.locale !== options.locale) continue;
      const body = extractText(doc.content);
      const tags = (doc.tags ?? []).join(" ");
      const hay = `${doc.title}\n${tags}\n${body}`.toLowerCase();
      if (!hay.includes(q)) continue;
      const idx = hay.indexOf(q);
      const start = Math.max(0, idx - 40);
      const snippet = body.slice(start, start + 120) || doc.title;
      results.push({ document: doc, space, snippet });
    }
  }
  return results.slice(0, 40);
}

export async function saveDocumentContent(
  id: string,
  content: TipTapDoc,
  title?: string,
  expectedUpdatedAt?: string,
): Promise<DocumentRecord | undefined> {
  return updateDocument(
    id,
    { content, ...(title !== undefined ? { title } : {}) },
    { revision: true, expectedUpdatedAt },
  );
}

export async function getWorkspacePayload(spaceId: string) {
  const data = await readStore();
  const space = data.spaces.find((s) => s.id === spaceId);
  if (!space) return null;
  const versionSpaces = data.spaces.filter(
    (s) => s.versionGroupId === space.versionGroupId,
  );
  return {
    organization: data.organization,
    space,
    spaces: data.spaces,
    versionSpaces,
    documents: data.documents.filter((d) => d.spaceId === spaceId),
    variables: data.variables,
    snippets: data.snippets,
    templates: data.templates,
    integrations: data.integrations,
    comments: data.comments.filter((c) =>
      data.documents.some(
        (d) => d.spaceId === spaceId && d.id === c.documentId,
      ),
    ),
  };
}
