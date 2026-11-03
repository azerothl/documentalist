import test from "node:test";
import assert from "node:assert/strict";
import { createSeedStore } from "../src/lib/seed";
import { migrateStore } from "../src/lib/migrate";
import {
  buildProductGuideDocuments,
  PRODUCT_GUIDE_VERSION,
} from "../src/lib/product-guide";
import { extractText, paragraphDoc } from "../src/lib/tiptap-text";
import { validateDocumentTree } from "../src/lib/validation";
import { findByPath } from "../src/lib/tree";
import { publicPortalData } from "../src/lib/portal";

test("guide bilingue : anciens liens, sections et parcours Learn publiables", () => {
  const data = createSeedStore();
  validateDocumentTree(data.documents, data.spaces);
  const space = data.spaces.find((s) => s.id === "spc_product")!;
  for (const locale of ["en", "fr"]) {
    const docs = publicPortalData(space, [], locale).documents;
    const reference = docs.filter((d) => d.section === "reference");
    const concepts = findByPath(reference, [
      "getting-started",
      "core-concepts",
    ]);
    assert.equal(
      concepts?.id,
      locale === "en" ? "doc_concepts" : "doc_concepts_fr",
    );
    assert.ok(findByPath(reference, ["mcp"]));
    assert.ok(findByPath(reference, ["troubleshooting"]));
    const learn = docs.filter((d) => d.section === "learn");
    for (const slug of [
      "start-here",
      "sign-in",
      "create-a-space",
      "write-and-review",
      "publish-public",
      "protect-with-code",
      "invite-portal-readers",
      "invite-teammates",
      "github-import",
      "other-imports",
      "languages-and-versions",
      "use-ai",
      "connect-an-agent",
      "read-and-navigate",
      "back-up-and-restore",
      "operate-the-platform",
    ]) {
      const page = findByPath(learn, [slug]);
      assert.ok(page, locale + ": parcours absent " + slug);
      assert.ok(
        extractText(page.content).length > 500,
        locale + ": parcours incomplet " + slug,
      );
      if (slug !== "start-here") {
        assert.ok(
          page.content.content?.some((node) => node.type === "orderedList"),
          locale + ": étapes absentes " + slug,
        );
      }
    }
  }
  const documents = buildProductGuideDocuments(
    space.id,
    "2026-11-03T00:00:00.000Z",
  );
  for (const english of documents.filter((d) => d.locale === "en")) {
    const french = documents.find((d) => d.translationOf === english.id);
    assert.equal(french?.slug, english.slug);
    assert.equal(french?.section, english.section);
    assert.equal(
      french?.parentId,
      english.parentId ? english.parentId + "_fr" : null,
    );
  }
});

test("actualiser le guide ne publie pas les brouillons personnalisés et conserve les variables capturées", () => {
  const data = createSeedStore();
  const space = data.spaces.find((s) => s.id === "spc_product")!;
  const template = data.documents.find((d) => d.id === "doc_welcome")!;
  const published = {
    ...structuredClone(template),
    id: "custom-published",
    slug: "custom-published",
    content: paragraphDoc("PUBLISHED_CUSTOM_ONLY"),
  };
  space.publishedSnapshot!.documents.push(published);
  data.documents.push({
    ...structuredClone(published),
    content: paragraphDoc("UNPUBLISHED_CUSTOM_CHANGE"),
  });
  data.documents.push({
    ...structuredClone(template),
    id: "custom-draft",
    slug: "custom-draft",
    content: paragraphDoc("NEVER_PUBLISHED"),
  });
  const capturedVariables = [
    {
      id: "v",
      orgId: data.organization.id,
      key: "captured",
      value: "PUBLISHED_VALUE",
    },
  ];
  space.publishedSnapshot!.variables = capturedVariables;
  data.variables.push({ ...capturedVariables[0], value: "DRAFT_VALUE" });
  template.createdAt = "2025-01-01T00:00:00.000Z";
  template.content = paragraphDoc("OLD_OFFICIAL_GUIDE");
  data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION - 1;
  migrateStore(data);
  assert.equal(data.organization.productGuideVersion, PRODUCT_GUIDE_VERSION);
  assert.equal(
    data.documents.find((d) => d.id === template.id)?.createdAt,
    "2025-01-01T00:00:00.000Z",
  );
  assert.ok(
    !extractText(
      data.documents.find((d) => d.id === template.id)!.content,
    ).includes("OLD_OFFICIAL_GUIDE"),
  );
  assert.equal(
    extractText(data.documents.find((d) => d.id === published.id)!.content),
    "UNPUBLISHED_CUSTOM_CHANGE",
  );
  assert.equal(
    extractText(
      space.publishedSnapshot!.documents.find((d) => d.id === published.id)!
        .content,
    ),
    "PUBLISHED_CUSTOM_ONLY",
  );
  assert.ok(
    !space.publishedSnapshot!.documents.some((d) => d.id === "custom-draft"),
  );
  assert.deepEqual(space.publishedSnapshot!.variables, capturedVariables);
  assert.ok(
    space.publishedSnapshot!.documents.some(
      (d) => d.id === "doc_learn_connect_an_agent_fr",
    ),
  );
  const once = JSON.stringify(data);
  migrateStore(data);
  assert.equal(
    JSON.stringify(data),
    once,
    "la migration doit être idempotente",
  );
});

test("le rafraîchissement ne crée pas de portail ou espace Product docs absent", () => {
  const data = createSeedStore();
  const space = data.spaces.find((s) => s.id === "spc_product")!;
  space.publishedSnapshot = null;
  space.publishedAt = null;
  data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION - 1;
  migrateStore(data);
  assert.equal(space.publishedSnapshot, null);
  assert.equal(space.publishedAt, null);
  data.spaces = data.spaces.filter((s) => s.id !== space.id);
  data.documents = data.documents.filter((d) => d.spaceId !== space.id);
  data.organization.productGuideVersion = PRODUCT_GUIDE_VERSION - 1;
  migrateStore(data);
  assert.ok(!data.spaces.some((s) => s.id === space.id));
});
