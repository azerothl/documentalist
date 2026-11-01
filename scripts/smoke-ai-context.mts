import {
  buildAiContextBundle,
  collectRelatedDocuments,
  extractLinkTargets,
  matchLinkedDocuments,
} from "../src/lib/ai-context.ts";
import { readStore } from "../src/lib/store.ts";
import type { DocumentRecord, TipTapDoc } from "../src/lib/types.ts";

function page(
  id: string,
  title: string,
  slug: string,
  content: TipTapDoc,
): DocumentRecord {
  return {
    id,
    spaceId: "s1",
    parentId: null,
    title,
    slug,
    kind: "page",
    href: null,
    content,
    position: 0,
    hidden: false,
    tags: [],
    locale: "fr",
    translationOf: null,
    sourcePath: null,
    markdownFormat: null,
    seoTitle: null,
    seoDescription: null,
    createdAt: "",
    updatedAt: "",
  };
}

function paraWithLink(text: string, href: string): TipTapDoc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Voir " },
          {
            type: "text",
            text,
            marks: [{ type: "link", attrs: { href } }],
          },
        ],
      },
    ],
  };
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// --- Synthetic unit checks ---
const a = page("a", "Guide", "guide", paraWithLink("API Reference", "/p/demo/api-ref"));
const b = page(
  "b",
  "API Reference",
  "api-ref",
  paraWithLink("Auth", "auth"),
);
const c = page("c", "Auth", "auth", {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "JWT" }] }],
});
const d = page("d", "Orpheline", "orphan", {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "seul" }] }],
});
const e = page(
  "e",
  "BitNet Native",
  "bitnet-native-gguf",
  paraWithLink("matrix", "MODEL_MATRIX.md"),
);
e.sourcePath = "docs/BITNET_NATIVE.md";
const f = page("f", "Model Matrix", "model-matrix", {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "table" }] }],
});
f.sourcePath = "docs/MODEL_MATRIX.md";
const synthetic = [a, b, c, d, e, f];

const fromA = matchLinkedDocuments(synthetic, a);
assert(
  fromA.some((x) => x.id === "b"),
  `Guide should resolve /p/demo/api-ref -> API Reference, got ${fromA.map((x) => x.title)}`,
);

const fromE = matchLinkedDocuments(synthetic, e);
assert(
  fromE.some((x) => x.id === "f"),
  `Markdown relative MODEL_MATRIX.md should resolve, got ${fromE.map((x) => x.title)}`,
);

const related = collectRelatedDocuments(synthetic, a);
assert(
  related.map((x) => x.id).join(",") === "b,c",
  `BFS Guide -> API -> Auth expected b,c got ${related.map((x) => x.id)}`,
);

const relatedBundle = buildAiContextBundle({
  scope: "related",
  spaceDocs: synthetic,
  primary: a,
});
assert(
  relatedBundle.sources.includes("Guide") &&
    relatedBundle.sources.includes("API Reference") &&
    relatedBundle.sources.includes("Auth") &&
    !relatedBundle.sources.includes("Orpheline"),
  `related sources wrong: ${relatedBundle.sources.join(" · ")}`,
);

const spaceBundle = buildAiContextBundle({
  scope: "space",
  spaceDocs: synthetic,
  primary: a,
});
assert(
  spaceBundle.sources.includes("Orpheline"),
  `space should include orphan, got ${spaceBundle.sources.join(" · ")}`,
);

console.log("synthetic OK");
console.log("  related:", relatedBundle.sources.join(" · "));
console.log("  space:", spaceBundle.sources.join(" · "));

// --- Live store ---
const data = await readStore();
const spaces = data.spaces ?? [];
const documents = (data.documents ?? []).filter(
  (doc) => doc.kind === "page" || doc.kind === "category",
);

console.log(`\nlive store: spaces=${spaces.length} docs=${documents.length}`);

for (const space of spaces) {
  const spaceDocs = documents.filter((doc) => doc.spaceId === space.id);
  let linkedEdges = 0;
  let unresolved = 0;
  const samples: string[] = [];

  for (const doc of spaceDocs) {
    const { hrefs } = extractLinkTargets(doc.content);
    if (!hrefs.length) continue;
    const linked = matchLinkedDocuments(spaceDocs, doc);
    if (linked.length) {
      linkedEdges += linked.length;
      if (samples.length < 5) {
        samples.push(
          `${doc.title} -> ${linked.map((x) => x.title).join(", ")} [${hrefs.slice(0, 3).join(" | ")}]`,
        );
      }
    } else {
      unresolved += 1;
      if (samples.length < 8) {
        samples.push(`UNRESOLVED ${doc.title}: ${hrefs.slice(0, 4).join(" | ")}`);
      }
    }
  }

  const withLinks =
    spaceDocs.find((doc) => matchLinkedDocuments(spaceDocs, doc).length > 0) ??
    spaceDocs[0];
  if (!withLinks) {
    console.log(`\n=== ${space.name}: empty`);
    continue;
  }

  const bundle = buildAiContextBundle({
    scope: "related",
    spaceDocs,
    primary: withLinks,
  });
  const whole = buildAiContextBundle({
    scope: "space",
    spaceDocs,
    primary: withLinks,
  });

  console.log(`\n=== ${space.name} (${spaceDocs.length} pages)`);
  console.log(` linked edges=${linkedEdges} unresolved=${unresolved}`);
  for (const s of samples) console.log(`  ${s}`);
  console.log(
    ` sample related (${bundle.sources.length}): ${bundle.sources.slice(0, 8).join(" · ")}`,
  );
  console.log(
    ` space sources=${whole.sources.length} truncated=${whole.truncated}`,
  );
}

console.log("\nsmoke-ai-context passed");
