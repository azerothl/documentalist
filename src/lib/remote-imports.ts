import { safeFetch } from "./outbound";
import type { GithubFile } from "./github";

export async function gitlabFiles(input: {
  host: string;
  repository: string;
  branch: string;
  path: string;
  token: string;
}) {
  const base = new URL(input.host || "https://gitlab.com").origin;
  const project = input.repository
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/\.git$/, "")
    .replace(/^\/+|\/+$/g, "");
  if (!project.includes("/") || project.includes(".."))
    throw new Error("Indiquez le chemin groupe/projet GitLab.");
  const api = `${base}/api/v4/projects/${encodeURIComponent(project)}`;
  const headers: Record<string, string> = input.token
    ? { "PRIVATE-TOKEN": input.token }
    : {};
  const paths: string[] = [];
  let page = "1";
  for (let count = 0; page && count < 100; count++) {
    const query = new URLSearchParams({
      recursive: "true",
      per_page: "100",
      page,
      ref: input.branch || "HEAD",
      ...(input.path ? { path: input.path } : {}),
    });
    const res = await safeFetch(`${api}/repository/tree?${query}`, { headers });
    if (!res.ok)
      throw new Error(`GitLab : accès au dépôt impossible (${res.status}).`);
    const items = (await res.json()) as { type: string; path: string }[];
    paths.push(
      ...items
        .filter(
          (n) => n.type === "blob" && /\.(md|mdx|markdown)$/i.test(n.path),
        )
        .map((n) => n.path),
    );
    page = res.headers.get("x-next-page") || "";
    if (paths.length > 80)
      throw new Error(
        "Le dossier contient plus de 80 documents. Choisissez un sous-dossier.",
      );
    if (count === 99 && page)
      throw new Error(
        "Arborescence trop volumineuse. Choisissez un sous-dossier.",
      );
  }
  const files: GithubFile[] = [];
  for (const file of paths) {
    const res = await safeFetch(
      `${api}/repository/files/${encodeURIComponent(file)}/raw?ref=${encodeURIComponent(input.branch || "HEAD")}`,
      { headers },
      1_000_000,
    );
    if (!res.ok)
      throw new Error(
        `GitLab : lecture de ${file} impossible (${res.status}).`,
      );
    files.push({ path: file, content: await res.text() });
  }
  return {
    owner: project.split("/").slice(0, -1).join("/"),
    repo: project.split("/").pop()!,
    branch: input.branch || "HEAD",
    files,
  };
}

type RichText = {
  plain_text?: string;
  text?: { content?: string; link?: { url: string } };
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean };
};
type Block = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};
function rich(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((v: RichText) => {
      let text = v.plain_text ?? v.text?.content ?? "";
      if (v.annotations?.code) text = `\`${text}\``;
      if (v.annotations?.bold) text = `**${text}**`;
      if (v.annotations?.italic) text = `*${text}*`;
      if (v.text?.link) text = `[${text}](${v.text.link.url})`;
      return text;
    })
    .join("");
}
export async function notionFiles(
  token: string,
  rootPageId: string,
  transport: typeof safeFetch = safeFetch,
) {
  const id = rootPageId.replace(/-/g, "");
  if (!/^[a-fA-F0-9]{32}$/.test(id))
    throw new Error("ID de page Notion invalide.");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
  };
  async function get(path: string) {
    const res = await transport(`https://api.notion.com/v1/${path}`, {
      headers,
    });
    if (!res.ok)
      throw new Error(
        `Notion : accès impossible (${res.status}). Partagez la page avec l’intégration.`,
      );
    return res.json();
  }
  const files: GithubFile[] = [];
  let count = 0;
  const warnings = new Set<string>();
  const visited = new Set<string>();
  async function blocks(blockId: string, depth = 0): Promise<string> {
    if (depth > 12) throw new Error("Limite de profondeur Notion atteinte.");
    let cursor = "";
    const lines: string[] = [];
    do {
      const result = await get(
        `blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      for (const block of result.results as Block[]) {
        if (++count > 2000)
          throw new Error("Import Notion limité à 2 000 blocs.");
        const value = (block[block.type] ?? {}) as {
          rich_text?: RichText[];
          title?: string;
          checked?: boolean;
          language?: string;
          url?: string;
          external?: { url: string };
          file?: { url: string };
        };
        const text = rich(value.rich_text);
        if (block.type === "child_page") {
          await page(block.id, value.title || "Page", depth + 1);
          lines.push(`Page importée : ${value.title || block.id}`);
          continue;
        }
        const prefixes: Record<string, string> = {
          heading_1: "# ",
          heading_2: "## ",
          heading_3: "### ",
          bulleted_list_item: "- ",
          numbered_list_item: "1. ",
          quote: "> ",
          callout: "> ",
        };
        if (block.type === "code")
          lines.push(`\`\`\`${value.language || ""}\n${text}\n\`\`\``);
        else if (block.type === "divider") lines.push("---");
        else if (block.type === "to_do")
          lines.push(`- [${value.checked ? "x" : " "}] ${text}`);
        else if (block.type === "image")
          lines.push(
            `![Image](${value.external?.url || value.file?.url || ""})`,
          );
        else if (block.type === "paragraph" || prefixes[block.type])
          lines.push((prefixes[block.type] || "") + text);
        else {
          warnings.add(block.type);
          lines.push(`[Bloc ${block.type} non converti] ${text}`);
        }
        if (block.has_children) lines.push(await blocks(block.id, depth + 1));
      }
      cursor = result.has_more ? result.next_cursor : "";
    } while (cursor);
    return lines.join("\n\n");
  }
  async function page(pageId: string, title?: string, depth = 0) {
    if (visited.has(pageId)) return;
    visited.add(pageId);
    if (visited.size > 80) throw new Error("Import Notion limité à 80 pages.");
    if (!title) {
      const metadata = await get(`pages/${pageId}`);
      const properties = Object.values(metadata.properties ?? {}) as {
        type: string;
        title?: RichText[];
      }[];
      title =
        rich(properties.find((p) => p.type === "title")?.title) ||
        "Documentation Notion";
    }
    const content = await blocks(pageId, depth);
    files.push({
      path: `docs/${pageId}.md`,
      content: `# ${title}\n\n${content}`,
    });
  }
  await page(id);
  return {
    owner: "Notion",
    repo: "Documentation",
    branch: "import",
    files,
    warnings: [...warnings],
  };
}
