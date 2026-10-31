export type GithubFile = {
  path: string;
  content: string;
};

function parseRepo(input: string): { owner: string; repo: string } {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository. Use owner/repo or a github.com URL.");
  }
  return { owner, repo };
}

async function ghFetch(
  url: string,
  token?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "documentalist",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers, next: { revalidate: 0 } });
}

export async function listMarkdownFiles(options: {
  repository: string;
  branch?: string;
  path?: string;
  token?: string | null;
}): Promise<{ owner: string; repo: string; branch: string; files: string[] }> {
  const { owner, repo } = parseRepo(options.repository);
  const branch = options.branch?.trim() || "main";
  const root = (options.path ?? "docs").replace(/^\/+|\/+$/g, "");

  const treeRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    options.token,
  );
  if (!treeRes.ok) {
    const text = await treeRes.text();
    throw new Error(
      `GitHub tree failed (${treeRes.status}): ${text.slice(0, 200)}. Check repo/branch/token.`,
    );
  }
  const tree = (await treeRes.json()) as {
    tree?: { path: string; type: string }[];
  };
  const files = (tree.tree ?? [])
    .filter((n) => n.type === "blob")
    .map((n) => n.path)
    .filter((p) => {
      if (!/\.(md|mdx|markdown)$/i.test(p)) return false;
      if (!root) return true;
      return p === root || p.startsWith(`${root}/`);
    })
    .sort();

  return { owner, repo, branch, files };
}

export async function fetchGithubMarkdownFiles(options: {
  repository: string;
  branch?: string;
  path?: string;
  token?: string | null;
  maxFiles?: number;
}): Promise<{
  owner: string;
  repo: string;
  branch: string;
  files: GithubFile[];
}> {
  const listed = await listMarkdownFiles(options);
  const max = options.maxFiles ?? 80;
  const selected = listed.files.slice(0, max);
  const files: GithubFile[] = [];

  for (const path of selected) {
    const encodedPath = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const res = await ghFetch(
      `https://api.github.com/repos/${listed.owner}/${listed.repo}/contents/${encodedPath}?ref=${encodeURIComponent(listed.branch)}`,
      options.token,
    );
    if (!res.ok) continue;
    const json = (await res.json()) as { content?: string; encoding?: string };
    if (!json.content || json.encoding !== "base64") continue;
    const content = Buffer.from(json.content.replace(/\n/g, ""), "base64").toString(
      "utf8",
    );
    files.push({ path, content });
  }

  return {
    owner: listed.owner,
    repo: listed.repo,
    branch: listed.branch,
    files,
  };
}
