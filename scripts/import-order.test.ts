import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLinkOrderMap,
  compareImportEntries,
  naturalCompare,
  numericPrefixOrder,
  orderFromReadmeCrawl,
  parseSummaryOrder,
  resolveMarkdownHref,
  sortImportFiles,
  frontmatterOrder,
} from "../src/lib/import-order";

test("naturalCompare orders numeric segments", () => {
  assert.ok(naturalCompare("docs/2-b.md", "docs/10-a.md") < 0);
  assert.ok(numericPrefixOrder("01-intro.md") === 1);
  assert.ok(numericPrefixOrder("10-advanced.md") === 10);
  assert.equal(numericPrefixOrder("intro.md"), null);
});

test("frontmatterOrder reads common keys", () => {
  assert.equal(frontmatterOrder({ sidebar_position: "3" }), 3);
  assert.equal(frontmatterOrder({ nav_order: "1.5" }), 1.5);
  assert.equal(frontmatterOrder({ title: "x" }), null);
});

test("resolveMarkdownHref normalizes relative links", () => {
  assert.equal(
    resolveMarkdownHref("docs", "./guide/start.md"),
    "docs/guide/start.md",
  );
  assert.equal(
    resolveMarkdownHref("docs/guide", "../api.md#auth"),
    "docs/api.md",
  );
  assert.equal(resolveMarkdownHref("docs", "https://example.com/a.md"), null);
});

test("parseSummaryOrder follows SUMMARY links", () => {
  const paths = new Set(["docs/intro.md", "docs/guide.md", "docs/api.md"]);
  const byLower = new Map([...paths].map((p) => [p.toLowerCase(), p]));
  const order = parseSummaryOrder(
    `# Summary
* [Intro](intro.md)
* [Guide](guide.md)
* [API](api.md)
`,
    "docs/SUMMARY.md",
    paths,
    byLower,
  );
  assert.equal(order.get("docs/intro.md"), 0);
  assert.equal(order.get("docs/guide.md"), 1);
  assert.equal(order.get("docs/api.md"), 2);
});

test("orderFromReadmeCrawl BFS from README", () => {
  const files = [
    {
      path: "docs/README.md",
      content: "# Docs\n\n- [Guide](guide.md)\n- [API](./api/overview.md)\n",
    },
    {
      path: "docs/guide.md",
      content: "# Guide\n\nSee [details](details.md).\n",
    },
    { path: "docs/details.md", content: "# Details\n" },
    { path: "docs/api/overview.md", content: "# API\n" },
    { path: "docs/orphan.md", content: "# Orphan\n" },
  ];
  const order = orderFromReadmeCrawl(files, "docs");
  assert.equal(order.get("docs/README.md"), 0);
  assert.equal(order.get("docs/guide.md"), 1);
  assert.equal(order.get("docs/api/overview.md"), 2);
  assert.equal(order.get("docs/details.md"), 3);
  assert.equal(order.has("docs/orphan.md"), false);
});

test("buildLinkOrderMap prefers SUMMARY over README", () => {
  const files = [
    {
      path: "docs/SUMMARY.md",
      content: "* [B](b.md)\n* [A](a.md)\n",
    },
    {
      path: "docs/README.md",
      content: "* [A](a.md)\n* [B](b.md)\n",
    },
    { path: "docs/a.md", content: "# A\n" },
    { path: "docs/b.md", content: "# B\n" },
  ];
  const order = buildLinkOrderMap(files, "docs");
  assert.equal(order.get("docs/b.md"), 0);
  assert.equal(order.get("docs/a.md"), 1);
});

test("sortImportFiles puts linked files first then orphans", () => {
  const files = [
    { path: "docs/orphan.md", content: "---\nsidebar_position: 1\n---\n# O\n" },
    { path: "docs/README.md", content: "# Home\n\n[Next](next.md)\n" },
    { path: "docs/next.md", content: "# Next\n" },
    { path: "docs/10-late.md", content: "# Late\n" },
    { path: "docs/2-mid.md", content: "# Mid\n" },
  ];
  const fm = new Map<string, Record<string, string>>([
    ["docs/orphan.md", { sidebar_position: "1" }],
  ]);
  const sorted = sortImportFiles(files, "docs", fm).map((f) => f.path);
  assert.deepEqual(sorted.slice(0, 2), ["docs/README.md", "docs/next.md"]);
  // orphans: frontmatter orphan first, then numeric 2 before 10
  assert.deepEqual(sorted.slice(2), [
    "docs/orphan.md",
    "docs/2-mid.md",
    "docs/10-late.md",
  ]);
});

test("compareImportEntries respects link then frontmatter", () => {
  assert.ok(
    compareImportEntries(
      {
        path: "a.md",
        linkIndex: 1,
        frontmatterOrder: null,
        numericPrefix: null,
      },
      {
        path: "b.md",
        linkIndex: 0,
        frontmatterOrder: null,
        numericPrefix: null,
      },
    ) > 0,
  );
});
