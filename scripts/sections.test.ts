import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  blogDate,
  compareBlogPosts,
  defaultSection,
  isBlogIntro,
  ownsFile,
  sectionDocuments,
} from "../src/lib/sections";
import { docSection, type DocumentRecord } from "../src/lib/types";

function doc(partial: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: "doc",
    spaceId: "spc",
    parentId: null,
    title: "Page",
    slug: "page",
    kind: "page",
    href: null,
    content: { type: "doc", content: [] },
    position: 0,
    hidden: false,
    tags: [],
    locale: "en",
    translationOf: null,
    sourcePath: null,
    markdownFormat: null,
    seoTitle: null,
    seoDescription: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

test("dates des notes de version : frontmatter puis chemin", () => {
  assert.equal(blogDate("blog/a.md", { date: "2024/12/05" }), "2024-12-05");
  assert.equal(
    blogDate("blog/a.md", { date: "2024-12-05T10:00:00Z" }),
    "2024-12-05",
  );
  assert.equal(
    blogDate("blog/a.md", { date: "December 5, 2024" }),
    "2024-12-05",
  );
  assert.equal(blogDate("blog/2023/03/16/react.md", {}), "2023-03-16");
  assert.equal(blogDate("blog/2023-03-16-react.md", {}), "2023-03-16");
  assert.equal(blogDate("blog/notes.md", {}), null);
  assert.equal(blogDate("blog/notes.md", { date: "2024-13-40" }), null);
});

test("un fichier appartient au dossier le plus précis", () => {
  const roots = ["docs", "docs/learn", "blog"];
  assert.ok(ownsFile("docs/api.md", "docs", roots));
  assert.ok(!ownsFile("docs/learn/intro.md", "docs", roots));
  assert.ok(ownsFile("docs/learn/intro.md", "docs/learn", roots));
  assert.ok(!ownsFile("blog/v1.md", "docs", roots));
  // An empty docs root means the whole repository, minus the other tabs.
  assert.ok(ownsFile("README.md", "", ["", "blog"]));
  assert.ok(!ownsFile("blog/v1.md", "", ["", "blog"]));
});

test("onglets : documents anciens en Reference, enfants orphelins remontés", () => {
  const docs = [
    doc({ id: "a" }),
    doc({ id: "b", section: "learn" }),
    doc({ id: "c", section: "learn", parentId: "a" }),
    doc({ id: "d", section: "blog", date: "2026-01-01" }),
  ];
  assert.equal(docSection(docs[0]), "reference");
  assert.deepEqual(
    sectionDocuments(docs, "learn").map((d) => [d.id, d.parentId]),
    [
      ["b", null],
      ["c", null],
    ],
  );
  assert.equal(defaultSection(docs), "learn");
  assert.equal(defaultSection([docs[0]]), "reference");
  assert.equal(defaultSection([]), "reference");
});

test("blog : du plus récent au plus ancien, introduction reconnue", () => {
  const posts = [
    doc({ id: "old", section: "blog", date: "2024-01-01" }),
    doc({ id: "none", section: "blog", date: null }),
    doc({ id: "new", section: "blog", date: "2026-10-01" }),
  ];
  assert.deepEqual(
    [...posts].sort(compareBlogPosts).map((d) => d.id),
    ["new", "old", "none"],
  );
  assert.ok(isBlogIntro(doc({ section: "blog", sourcePath: "blog/index.md" })));
  assert.ok(
    !isBlogIntro(
      doc({ section: "blog", sourcePath: "blog/index.md", date: "2026-01-01" }),
    ),
  );
  assert.ok(!isBlogIntro(doc({ sourcePath: "docs/index.md" })));
});

test("import par onglet, synchronisation et déplacement", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "documentalist-sections-"));
  process.env.DOCUMENTALIST_DATA_DIR = dir;
  const store = await import("../src/lib/store");
  const github = { owner: "acme", repo: "docs", branch: "main", files: [] };
  try {
    let spaceId = "";
    await t.test("chaque dossier alimente son onglet", async () => {
      const result = await store.importRepositoryFiles(
        {
          provider: "github",
          repository: "acme/docs",
          path: "docs",
          parts: [
            {
              section: "reference",
              root: "docs",
              files: [
                { path: "docs/api.md", content: "# API\n\nRéférence." },
                {
                  path: "docs/hooks/use-state.md",
                  content: "# useState\n\nHook.",
                },
              ],
            },
            {
              section: "learn",
              root: "learn",
              files: [
                { path: "learn/start.md", content: "# Démarrer\n\nGuide." },
              ],
            },
            {
              section: "blog",
              root: "blog",
              files: [
                {
                  path: "blog/2025/01/10/v1.md",
                  content: "# Version 1\n\nPremière version.",
                },
                {
                  path: "blog/v2.md",
                  content:
                    "---\ntitle: Version 2\ndate: 2026-03-01\n---\n\nSuite.",
                },
              ],
            },
          ],
        },
        github,
      );
      spaceId = result.space.id;
      assert.equal(result.imported, 5);
      assert.equal(result.space.importSource?.learnPath, "learn");
      assert.equal(result.space.importSource?.blogPath, "blog");
      const docs = await store.listDocuments(spaceId);
      const bySource = new Map(docs.map((d) => [d.sourcePath, d]));
      assert.equal(bySource.get("docs/api.md")?.section, "reference");
      assert.equal(bySource.get("docs/hooks")?.kind, "category");
      assert.equal(bySource.get("docs/hooks")?.section, "reference");
      assert.equal(bySource.get("learn/start.md")?.section, "learn");
      const blog = docs
        .filter((d) => docSection(d) === "blog")
        .sort((a, b) => a.position - b.position);
      // Flat list, no year/month folders, newest first.
      assert.deepEqual(
        blog.map((d) => [d.title, d.date, d.parentId]),
        [
          ["Version 2", "2026-03-01", null],
          ["Version 1", "2025-01-10", null],
        ],
      );
    });

    await t.test(
      "une note supprimée disparaît sans toucher aux autres onglets",
      async () => {
        const result = await store.importRepositoryFiles(
          {
            provider: "github",
            repository: "acme/docs",
            path: "docs",
            spaceId,
            parts: [
              {
                section: "reference",
                root: "docs",
                files: [
                  { path: "docs/api.md", content: "# API\n\nRéférence." },
                  {
                    path: "docs/hooks/use-state.md",
                    content: "# useState\n\nHook.",
                  },
                ],
              },
              {
                section: "blog",
                root: "blog",
                files: [
                  {
                    path: "blog/v2.md",
                    content:
                      "---\ntitle: Version 2\ndate: 2026-03-01\n---\n\nSuite.",
                  },
                ],
              },
            ],
          },
          github,
        );
        assert.equal(result.removed, 1);
        const docs = await store.listDocuments(spaceId);
        assert.ok(docs.some((d) => d.sourcePath === "learn/start.md"));
        assert.ok(!docs.some((d) => d.sourcePath === "blog/2025/01/10/v1.md"));
      },
    );

    await t.test("création et déplacement suivent l’onglet", async () => {
      const docs = await store.listDocuments(spaceId);
      const folder = docs.find((d) => d.sourcePath === "docs/hooks")!;
      const child = await store.createDocument({
        spaceId,
        title: "useEffect",
        parentId: folder.id,
        section: "blog",
      });
      assert.equal(child.section, "reference", "un enfant hérite du parent");
      const post = await store.createDocument({
        spaceId,
        title: "Version 3",
        section: "blog",
      });
      assert.equal(post.section, "blog");
      assert.match(post.date ?? "", /^\d{4}-\d{2}-\d{2}$/);

      await store.updateDocument(folder.id, { section: "learn" });
      const after = await store.listDocuments(spaceId);
      assert.equal(after.find((d) => d.id === folder.id)?.section, "learn");
      assert.equal(after.find((d) => d.id === child.id)?.section, "learn");
    });
  } finally {
    const { database } = await import("../src/lib/database");
    database().close();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
