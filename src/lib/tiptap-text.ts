import type { TipTapDoc, TipTapNode } from "./types";

export function extractText(doc: TipTapDoc | TipTapNode | null | undefined): string {
  if (!doc) return "";
  const parts: string[] = [];

  function walk(node: TipTapNode | TipTapDoc) {
    if ("text" in node && typeof node.text === "string") {
      parts.push(node.text);
    }
    if ("content" in node && Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
      if (
        "type" in node &&
        (node.type === "paragraph" ||
          node.type === "heading" ||
          node.type === "listItem" ||
          node.type === "blockquote")
      ) {
        parts.push("\n");
      }
    }
  }

  walk(doc);
  return parts.join("").replace(/\n+/g, "\n").trim();
}

export function extractHeadings(
  doc: TipTapDoc | null | undefined,
): { id: string; level: number; text: string }[] {
  if (!doc?.content) return [];
  const headings: { id: string; level: number; text: string }[] = [];
  let i = 0;
  for (const node of doc.content) {
    if (node.type === "heading") {
      const level = Number(node.attrs?.level ?? 2);
      const text = extractText(node);
      const id = `h-${i}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
      headings.push({ id, level, text });
      i += 1;
    }
  }
  return headings;
}

export function applyVariables(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    return key in vars ? vars[key] : `{{${key}}}`;
  });
}

export function emptyDoc(): TipTapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function paragraphDoc(...paragraphs: string[]): TipTapDoc {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : undefined,
    })),
  };
}

export function richDoc(
  blocks: Array<
    | { type: "heading"; level: 1 | 2 | 3; text: string }
    | { type: "paragraph"; text: string }
    | { type: "bullet"; items: string[] }
    | { type: "ordered"; items: string[] }
    | { type: "code"; text: string }
    | { type: "blockquote"; text: string }
    | { type: "callout"; text: string; variant?: "info" | "warning" | "success" }
  >,
): TipTapDoc {
  const content: TipTapNode[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        content.push({
          type: "heading",
          attrs: { level: block.level },
          content: [{ type: "text", text: block.text }],
        });
        break;
      case "paragraph":
        content.push({
          type: "paragraph",
          content: block.text ? [{ type: "text", text: block.text }] : undefined,
        });
        break;
      case "bullet":
      case "ordered":
        content.push({
          type: block.type === "bullet" ? "bulletList" : "orderedList",
          content: block.items.map((item) => ({
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: item }],
              },
            ],
          })),
        });
        break;
      case "code":
        content.push({
          type: "codeBlock",
          content: [{ type: "text", text: block.text }],
        });
        break;
      case "blockquote":
        content.push({
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: block.text }],
            },
          ],
        });
        break;
      case "callout":
        content.push({
          type: "callout",
          attrs: { variant: block.variant ?? "info" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: block.text }],
            },
          ],
        });
        break;
      default: {
        const _exhaustive: never = block;
        void _exhaustive;
      }
    }
  }
  return { type: "doc", content };
}
