import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  accentStyle,
  contrastRatio,
  parseAppearance,
  type Theme,
} from "../src/lib/appearance";
import { readingContent } from "../src/lib/reading";
import { DocumentContent } from "../src/components/DocumentContent";
import type { TipTapDoc } from "../src/lib/types";

test("les accents personnalisés restent lisibles dans les trois thèmes", () => {
  for (const theme of ["light", "dark", "contrast"] as Theme[]) {
    for (const brand of [
      "#ffffff",
      "#000000",
      "#ffff00",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#0f6e56",
      "#185fa5",
      "#1f425b",
      "#c76a55",
      "invalid",
    ]) {
      const colors = accentStyle(brand, theme) as Record<string, string>;
      const surfaces =
        theme === "dark"
          ? ["#0d2432", "#12283a"]
          : theme === "contrast"
            ? ["#ffffff"]
            : ["#ffffff", "#f8f9fb"];
      for (const bg of [...surfaces, colors["--accent-soft"]]) {
        assert.ok(
          contrastRatio(colors["--accent"], bg) >= 4.5,
          `${theme}, ${brand}, ${bg}`,
        );
      }
      assert.ok(
        contrastRatio(colors["--on-accent"], colors["--accent"]) >= 4.5,
      );
    }
  }
});

test("les préférences corrompues ou étrangères sont remplacées par des valeurs valides", () => {
  for (const input of [
    null,
    "invalid-json",
    '"text"',
    '{"theme":"unknown","fontSize":200,"width":"invalid"}',
  ]) {
    assert.deepEqual(parseAppearance(input), {
      theme: "system",
      fontSize: 16,
      width: "comfortable",
      readingMode: false,
    });
  }
  assert.deepEqual(
    parseAppearance(
      '{"theme":"dark","fontSize":20,"width":"wide","readingMode":true}',
    ),
    { theme: "dark", fontSize: 20, width: "wide", readingMode: true },
  );
});

test("la lecture retire seulement le titre répété et conserve le contenu original", () => {
  const doc: TipTapDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Reading guide" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep this introduction." }],
      },
    ],
  };
  const original = JSON.stringify(doc);
  assert.equal(readingContent(doc, "Reading guide").content?.length, 1);
  assert.equal(readingContent(doc, "Different title").content?.length, 2);
  assert.equal(JSON.stringify(doc), original);
});

test("les encadrés publiés conservent leur intitulé et leur sens", () => {
  const content: TipTapDoc = {
    type: "doc",
    content: ["info", "warning", "success"].map((variant) => ({
      type: "callout",
      attrs: { variant },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: `Content ${variant}` }],
        },
      ],
    })),
  };
  const html = renderToStaticMarkup(
    createElement(DocumentContent, { content }),
  );
  for (const label of [
    "Information",
    "Attention",
    "Succès",
    "Content info",
    "Content warning",
    "Content success",
  ])
    assert.ok(html.includes(label));
  for (const variant of ["info", "warning", "success"])
    assert.ok(html.includes(`doc-callout--${variant}`));
});
