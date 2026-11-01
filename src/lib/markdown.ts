import type { MarkdownFormat, TipTapDoc, TipTapNode } from "./types";

export type ParsedMarkdown = {
  format: Exclude<MarkdownFormat, "auto">;
  frontmatter: Record<string, string>;
  doc: TipTapDoc;
  titleFromHeading: string | null;
};

function inlineToMd(nodes: TipTapNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") {
        let t = n.text ?? "";
        const marks = [...(n.marks ?? [])].reverse();
        for (const mark of marks) {
          switch (mark.type) {
            case "bold":
              t = `**${t}**`;
              break;
            case "italic":
              t = `*${t}*`;
              break;
            case "code":
              t = `\`${t}\``;
              break;
            case "strike":
              t = `~~${t}~~`;
              break;
            case "link":
              t = `[${t}](${String(mark.attrs?.href ?? "")})`;
              break;
            default:
              break;
          }
        }
        return t;
      }
      if (n.type === "hardBreak") return "  \n";
      return inlineToMd(n.content);
    })
    .join("");
}

function nodeToMd(node: TipTapNode): string {
  switch (node.type) {
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      return `${"#".repeat(level)} ${inlineToMd(node.content)}\n\n`;
    }
    case "paragraph":
      return `${inlineToMd(node.content)}\n\n`;
    case "bulletList":
      return (
        (node.content ?? [])
          .map((li) => `- ${inlineToMd(li.content?.[0]?.content).trim()}`)
          .join("\n") + "\n\n"
      );
    case "taskList":
      return (
        (node.content ?? [])
          .map((li) => {
            const checked = li.attrs?.checked ? "x" : " ";
            return `- [${checked}] ${inlineToMd(li.content?.[0]?.content).trim()}`;
          })
          .join("\n") + "\n\n"
      );
    case "table": {
      const rows = (node.content ?? []).map((row) =>
        (row.content ?? [])
          .map((cell) => inlineToMd(cell.content?.[0]?.content).trim())
          .join(" | "),
      );
      if (rows.length === 0) return "";
      const header = `| ${rows[0]} |`;
      const sep = `| ${rows[0]
        .split(" | ")
        .map(() => "---")
        .join(" | ")} |`;
      const body = rows
        .slice(1)
        .map((r) => `| ${r} |`)
        .join("\n");
      return `${header}\n${sep}${body ? `\n${body}` : ""}\n\n`;
    }
    case "orderedList":
      return (
        (node.content ?? [])
          .map(
            (li, i) =>
              `${i + 1}. ${inlineToMd(li.content?.[0]?.content).trim()}`,
          )
          .join("\n") + "\n\n"
      );
    case "blockquote":
      return (
        (node.content ?? [])
          .map((c) => `> ${inlineToMd(c.content).trim()}`)
          .join("\n") + "\n\n"
      );
    case "codeBlock": {
      const lang = node.attrs?.language ? String(node.attrs.language) : "";
      return `\`\`\`${lang}\n${inlineToMd(node.content)}\n\`\`\`\n\n`;
    }
    case "horizontalRule":
      return `---\n\n`;
    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      const title = node.attrs?.title ? ` "${String(node.attrs.title)}"` : "";
      return `![${alt}](${src}${title})\n\n`;
    }
    case "callout": {
      const variant = String(node.attrs?.variant ?? "info");
      const body = (node.content ?? []).map(nodeToMd).join("").trim();
      return `> [!${variant}]\n> ${body.replace(/\n/g, "\n> ")}\n\n`;
    }
    default:
      return (node.content ?? []).map(nodeToMd).join("");
  }
}

export function tipTapToMarkdown(doc: TipTapDoc): string {
  return (doc.content ?? []).map(nodeToMd).join("").trim() + "\n";
}

export function detectMarkdownFormat(
  md: string,
): Exclude<MarkdownFormat, "auto"> {
  if (
    /^---\s*\n[\s\S]*?\n---\s*\n/.test(md) &&
    /(^|\n)(import\s+|export\s+|<[A-Z][A-Za-z0-9]*)/.test(md)
  ) {
    return "mdx";
  }
  if (
    /(^|\n)(import\s+.+from\s+['"]|export\s+(default\s+)?function|<[A-Z][\w.]*[\s/>])/.test(
      md,
    )
  ) {
    return "mdx";
  }
  if (
    /\[\[[^\]]+\]\]/.test(md) ||
    />\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|INFO|SUCCESS)\]/i.test(md)
  ) {
    return "obsidian";
  }
  if (/^\|.+\|$/m.test(md) || /- \[[ xX]\] /.test(md) || /~~.+~~/.test(md)) {
    return "gfm";
  }
  return "commonmark";
}

function extractFrontmatter(md: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { frontmatter: {}, body: md };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) frontmatter[key] = value;
  }
  return { frontmatter, body: md.slice(match[0].length) };
}

function stripMdx(md: string): string {
  return md
    .replace(/^import\s.+;?\s*$/gm, "")
    .replace(/^export\s.+;?\s*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<([A-Z][\w.]*)(\s[^>]*)?\/>/g, (_m, name: string) => {
      return `\n> [!info]\n> MDX component <${name} /> omitted on import.\n`;
    })
    .replace(
      /<([A-Z][\w.]*)(\s[^>]*)?>[\s\S]*?<\/\1>/g,
      (_m, name: string) =>
        `\n> [!info]\n> MDX component <${name}>…</${name}> omitted on import.\n`,
    );
}

function resolveWikilinks(md: string): string {
  return md.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, target, label) => {
      const text = (label ?? target).trim();
      const href = `#${String(target).trim().toLowerCase().replace(/\s+/g, "-")}`;
      return `[${text}](${href})`;
    },
  );
}

function parseInline(text: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  const re =
    /(\*\*[^*]+\*\*|(?<![\p{L}\p{N}_])__[^_]+__(?![\p{L}\p{N}_])|\*[^*]+\*|(?<![\p{L}\p{N}_])_[^_]+_(?![\p{L}\p{N}_])|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      nodes.push({ type: "text", text: text.slice(last, m.index) });
    }
    const token = m[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push({
        type: "text",
        text: token.slice(2, -2),
        marks: [{ type: "bold" }],
      });
    } else if (token.startsWith("~~")) {
      nodes.push({
        type: "text",
        text: token.slice(2, -2),
        marks: [{ type: "strike" }],
      });
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push({
        type: "text",
        text: token.slice(1, -1),
        marks: [{ type: "italic" }],
      });
    } else if (token.startsWith("`")) {
      nodes.push({
        type: "text",
        text: token.slice(1, -1),
        marks: [{ type: "code" }],
      });
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push({
          type: "text",
          text: link[1],
          marks: [{ type: "link", attrs: { href: link[2] } }],
        });
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.length ? nodes : [{ type: "text", text: "" }];
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return /^[\s|:-]+$/.test(t);
}

function splitTableRow(line: string): string[] {
  let raw = line.trim();
  if (raw.startsWith("|")) raw = raw.slice(1);
  if (raw.endsWith("|")) raw = raw.slice(0, -1);
  return raw.split("|").map((c) => c.trim());
}

function shouldLiftTableFence(lang: string): boolean {
  const l = lang.trim().toLowerCase();
  return !l || l === "table" || l === "markdown" || l === "md" || l === "gfm";
}

export function looksLikeGfmTable(text: string): boolean {
  const lines = text
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return false;
  const pipeLines = lines.filter((l) => l.includes("|"));
  if (pipeLines.length < 2) return false;
  // Majority of non-empty lines should be table-ish
  if (pipeLines.length / lines.length < 0.8) return false;
  return lines.some((l, i) => i > 0 && isTableSeparator(l));
}

function rowsToTableNode(rows: string[][]): TipTapNode | null {
  if (rows.length === 0) return null;
  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount === 0) return null;
  const normalized = rows.map((r) => {
    const next = [...r];
    while (next.length < colCount) next.push("");
    return next.slice(0, colCount);
  });
  const [header, ...body] = normalized;
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: header.map((cell) => ({
          type: "tableHeader",
          content: [{ type: "paragraph", content: parseInline(cell) }],
        })),
      },
      ...body.map((row) => ({
        type: "tableRow",
        content: row.map((cell) => ({
          type: "tableCell",
          content: [{ type: "paragraph", content: parseInline(cell) }],
        })),
      })),
    ],
  };
}

export function gfmTableToNode(text: string): TipTapNode | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (isTableSeparator(line)) continue;
    if (!line.includes("|")) continue;
    rows.push(splitTableRow(line));
  }
  return rowsToTableNode(rows);
}

/** Convert fenced “tables” and pipe-paragraph runs into real table nodes. */
export function repairTipTapDoc(doc: TipTapDoc): TipTapDoc {
  const content = doc.content ?? [];
  const next: TipTapNode[] = [];
  for (const node of content) {
    if (node.type === "codeBlock") {
      const text = inlineToMd(node.content);
      const lang = node.attrs?.language ? String(node.attrs.language) : "";
      if (shouldLiftTableFence(lang) && looksLikeGfmTable(text)) {
        const table = gfmTableToNode(text);
        if (table) {
          next.push(table);
          continue;
        }
      }
      next.push(node);
      continue;
    }
    next.push(node);
  }
  return { type: "doc", content: next };
}

function parseCalloutLine(
  line: string,
): { variant: string; rest: string } | null {
  const m = line.match(/^>\s*\[!([A-Za-z]+)\]\s*(.*)$/);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const variant =
    raw === "warning" || raw === "caution"
      ? "warning"
      : raw === "success" || raw === "tip"
        ? "success"
        : "info";
  return { variant, rest: m[2] ?? "" };
}

export function markdownToTipTap(
  md: string,
  format: MarkdownFormat = "auto",
): TipTapDoc {
  return parseMarkdown(md, format).doc;
}

export function parseMarkdown(
  raw: string,
  format: MarkdownFormat = "auto",
): ParsedMarkdown {
  const { frontmatter, body: afterFm } = extractFrontmatter(
    raw.replace(/^\uFEFF/, ""),
  );
  let detected = format === "auto" ? detectMarkdownFormat(raw) : format;
  if (
    format === "auto" &&
    Object.keys(frontmatter).length &&
    detected === "commonmark"
  ) {
    if (/(^|\n)(import\s+|<[A-Z])/.test(afterFm)) detected = "mdx";
  }

  let body = afterFm;
  if (detected === "mdx") body = stripMdx(body);
  if (detected === "obsidian") body = resolveWikilinks(body);

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const content: TipTapNode[] = [];
  let i = 0;
  let titleFromHeading: string | null = null;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      content.push({ type: "horizontalRule" });
      i += 1;
      continue;
    }

    const calloutStart = parseCalloutLine(line);
    if (
      calloutStart &&
      (detected === "obsidian" || detected === "gfm" || detected === "mdx")
    ) {
      const paras: string[] = [];
      if (calloutStart.rest.trim()) paras.push(calloutStart.rest.trim());
      i += 1;
      while (i < lines.length && lines[i].startsWith(">")) {
        paras.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      content.push({
        type: "callout",
        attrs: { variant: calloutStart.variant },
        content: paras.map((p) => ({
          type: "paragraph",
          content: parseInline(p),
        })),
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      if (!titleFromHeading && heading[1].length === 1) {
        titleFromHeading = heading[2].trim();
      }
      content.push({
        type: "heading",
        attrs: { level },
        content: parseInline(heading[2]),
      });
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const codeText = code.join("\n");
      // Tables often land in fences (``` / ```table / ```markdown) — lift them.
      if (shouldLiftTableFence(lang) && looksLikeGfmTable(codeText)) {
        const table = gfmTableToNode(codeText);
        if (table) {
          content.push(table);
          continue;
        }
      }
      content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: [{ type: "text", text: codeText }],
      });
      continue;
    }

    const imageOnly = line
      .trim()
      .match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (imageOnly) {
      content.push({
        type: "image",
        attrs: {
          src: imageOnly[2],
          alt: imageOnly[1],
          ...(imageOnly[3] ? { title: imageOnly[3] } : {}),
        },
      });
      i += 1;
      continue;
    }

    // GFM table → TipTap table (always, even for commonmark)
    if (
      /^\|.+\|$/.test(line.trim()) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        const raw = lines[i].trim();
        if (!isTableSeparator(raw)) {
          rows.push(splitTableRow(raw));
        }
        i += 1;
      }
      const table = rowsToTableNode(rows);
      if (table) content.push(table);
      continue;
    }

    if (/^- \[[ xX]\]\s+/.test(line)) {
      const items: TipTapNode[] = [];
      while (i < lines.length && /^- \[[ xX]\]\s+/.test(lines[i])) {
        const task = lines[i].match(/^- \[([ xX])\]\s+(.*)$/)!;
        items.push({
          type: "taskItem",
          attrs: { checked: task[1].toLowerCase() === "x" },
          content: [
            {
              type: "paragraph",
              content: parseInline(task[2]),
            },
          ],
        });
        i += 1;
      }
      content.push({ type: "taskList", content: items });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: TipTapNode[] = [];
      while (
        i < lines.length &&
        /^[-*]\s+/.test(lines[i]) &&
        !/^- \[[ xX]\]\s+/.test(lines[i])
      ) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: parseInline(lines[i].replace(/^[-*]\s+/, "")),
            },
          ],
        });
        i += 1;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: TipTapNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: parseInline(lines[i].replace(/^\d+\.\s+/, "")),
            },
          ],
        });
        i += 1;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      content.push({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: parseInline(quote.join(" ")),
          },
        ],
      });
      continue;
    }

    content.push({
      type: "paragraph",
      content: parseInline(line),
    });
    i += 1;
  }

  if (content.length === 0) content.push({ type: "paragraph" });

  return {
    format: detected,
    frontmatter,
    doc: { type: "doc", content },
    titleFromHeading,
  };
}
