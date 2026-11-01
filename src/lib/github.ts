import { unzipSync } from "fflate";
import { Agent, fetch as undiciFetch } from "undici";
import { lookup } from "node:dns/promises";
import { publicAddress, validateOutboundUrl } from "./outbound";

export type GithubFile = {
  path: string;
  content: string;
};

export type GithubImportResult = {
  owner: string;
  repo: string;
  branch: string;
  files: GithubFile[];
  /** Markdown paths matched before maxFiles truncation */
  matched: number;
  truncated: boolean;
  /** Paths that could not be read (per-file fallback only) */
  failed: string[];
};

const DEFAULT_MAX_FILES = 500;
const ZIP_MAX_BYTES = 200_000_000;

function parseRepo(input: string): { owner: string; repo: string } {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) {
    throw new Error("Dépôt invalide. Utilisez owner/repo ou une URL github.com.");
  }
  return { owner, repo };
}

function isAllowedGithubHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "api.github.com" ||
    h === "github.com" ||
    h === "codeload.github.com" ||
    h.endsWith(".githubusercontent.com")
  );
}

async function ghAgentFetch(
  input: string,
  init: {
    headers?: Record<string, string>;
    redirect?: "error" | "manual";
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<Response> {
  const { url } = validateOutboundUrl(input);
  if (!isAllowedGithubHost(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new Error("Hôte GitHub non autorisé.");
  }
  const maxBytes = init.maxBytes ?? 5_000_000;
  const agent = new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        lookup(hostname, { all: true })
          .then((addresses) => {
            if (
              !addresses.length ||
              addresses.some((a) => !publicAddress(a.address))
            ) {
              throw new Error("Adresse réseau interne refusée.");
            }
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0]!.address, addresses[0]!.family);
          })
          .catch((error) => callback(error as Error, "", 0));
      },
    },
  });
  try {
    const response = await undiciFetch(url, {
      method: "GET",
      headers: init.headers,
      dispatcher: agent,
      redirect: init.redirect ?? "error",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      return new Response(null, {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      });
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      throw new Error("Réponse GitHub trop volumineuse.");
    }
    const parts: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      for await (const part of response.body) {
        size += part.length;
        if (size > maxBytes) throw new Error("Réponse GitHub trop volumineuse.");
        parts.push(part);
      }
    }
    return new Response(
      [204, 205, 304].includes(response.status) ? null : Buffer.concat(parts),
      {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      },
    );
  } finally {
    await agent.destroy();
  }
}

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "documentalist",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghApi(url: string, token?: string | null): Promise<Response> {
  return ghAgentFetch(url, { headers: authHeaders(token), redirect: "error" });
}

export async function listMarkdownFiles(options: {
  repository: string;
  branch?: string;
  path?: string;
  token?: string | null;
}): Promise<{
  owner: string;
  repo: string;
  branch: string;
  files: string[];
  truncated: boolean;
}> {
  const { owner, repo } = parseRepo(options.repository);
  const branch = options.branch?.trim() || "main";
  const root = (options.path ?? "docs").replace(/^\/+|\/+$/g, "");

  const treeRes = await ghApi(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    options.token,
  );
  if (!treeRes.ok) {
    const text = await treeRes.text();
    throw new Error(
      `Arbre GitHub impossible (${treeRes.status}): ${text.slice(0, 200)}. Vérifiez dépôt/branche/jeton.`,
    );
  }
  const tree = (await treeRes.json()) as {
    truncated?: boolean;
    tree?: { path: string; type: string }[];
  };
  if (tree.truncated) {
    throw new Error(
      "L’arbre GitHub est tronqué (dépôt trop large). Affinez le dossier docs (ex. docs/user) ou importez une sous-arborescence.",
    );
  }
  const files = (tree.tree ?? [])
    .filter((n) => n.type === "blob")
    .map((n) => n.path)
    .filter((p) => {
      if (!/\.(md|mdx|markdown)$/i.test(p)) return false;
      if (!root) return true;
      return p === root || p.startsWith(`${root}/`);
    })
    .sort();

  return { owner, repo, branch, files, truncated: false };
}

function matchZipEntry(
  entryPath: string,
  root: string,
): string | null {
  // zipball paths: owner-repo-<sha>/docs/foo.md
  const slash = entryPath.indexOf("/");
  if (slash < 0) return null;
  const inner = entryPath.slice(slash + 1);
  if (!/\.(md|mdx|markdown)$/i.test(inner)) return null;
  if (inner.includes("/.git/") || inner.startsWith(".git/")) return null;
  if (!root) return inner;
  if (inner === root || inner.startsWith(`${root}/`)) return inner;
  return null;
}

async function downloadZipball(options: {
  owner: string;
  repo: string;
  branch: string;
  token?: string | null;
}): Promise<Uint8Array> {
  // Prefer codeload (does not burn api.github.com rate limit for public repos).
  const codeloadUrl = `https://codeload.github.com/${options.owner}/${options.repo}/zip/refs/heads/${encodeURIComponent(options.branch)}`;
  try {
    const direct = await ghAgentFetch(codeloadUrl, {
      headers: authHeaders(options.token),
      redirect: "error",
      timeoutMs: 120_000,
      maxBytes: ZIP_MAX_BYTES,
    });
    if (direct.ok) return new Uint8Array(await direct.arrayBuffer());
  } catch {
    // Fall through to API zipball (needed for some private repos / refs).
  }

  const apiUrl = `https://api.github.com/repos/${options.owner}/${options.repo}/zipball/${encodeURIComponent(options.branch)}`;
  const first = await ghAgentFetch(apiUrl, {
    headers: {
      ...authHeaders(options.token),
      Accept: "application/vnd.github+json",
    },
    redirect: "manual",
    timeoutMs: 120_000,
    maxBytes: ZIP_MAX_BYTES,
  });

  let zipRes = first;
  if ([301, 302, 303, 307, 308].includes(first.status)) {
    const location = first.headers.get("location");
    if (!location) throw new Error("Redirection zipball GitHub sans Location.");
    const next = new URL(location, apiUrl);
    if (!isAllowedGithubHost(next.hostname)) {
      throw new Error(`Redirection zipball refusée vers ${next.hostname}.`);
    }
    zipRes = await ghAgentFetch(next.toString(), {
      headers: authHeaders(options.token),
      redirect: "error",
      timeoutMs: 120_000,
      maxBytes: ZIP_MAX_BYTES,
    });
  }

  if (!zipRes.ok) {
    const text = await zipRes.text();
    throw new Error(
      `Téléchargement zipball impossible (${zipRes.status}): ${text.slice(0, 200)}`,
    );
  }
  return new Uint8Array(await zipRes.arrayBuffer());
}

function extractMarkdownFromZip(
  zipBytes: Uint8Array,
  root: string,
  maxFiles: number,
): { files: GithubFile[]; matched: number; truncated: boolean } {
  const unzipped = unzipSync(zipBytes);
  const matchedPaths: string[] = [];
  const byPath = new Map<string, Uint8Array>();

  for (const [entryPath, data] of Object.entries(unzipped)) {
    if (!data || entryPath.endsWith("/")) continue;
    const inner = matchZipEntry(entryPath, root);
    if (!inner) continue;
    matchedPaths.push(inner);
    byPath.set(inner, data);
  }
  matchedPaths.sort();
  const truncated = matchedPaths.length > maxFiles;
  const selected = matchedPaths.slice(0, maxFiles);
  const files: GithubFile[] = selected.map((path) => ({
    path,
    content: Buffer.from(byPath.get(path)!).toString("utf8"),
  }));
  return { files, matched: matchedPaths.length, truncated };
}

/**
 * List via git tree (1 API call), download bodies from raw.githubusercontent.com
 * (does not consume REST Contents rate limit per file).
 */
async function fetchViaRaw(options: {
  owner: string;
  repo: string;
  branch: string;
  root: string;
  token?: string | null;
  maxFiles: number;
}): Promise<GithubImportResult> {
  const listed = await listMarkdownFiles({
    repository: `${options.owner}/${options.repo}`,
    branch: options.branch,
    path: options.root,
    token: options.token,
  });
  const matched = listed.files.length;
  const truncated = matched > options.maxFiles;
  const selected = listed.files.slice(0, options.maxFiles);
  const files: GithubFile[] = [];
  const failed: string[] = [];

  const concurrency = 8;
  for (let i = 0; i < selected.length; i += concurrency) {
    const batch = selected.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (path) => {
        const encoded = path
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/");
        const url = `https://raw.githubusercontent.com/${options.owner}/${options.repo}/${encodeURIComponent(options.branch)}/${encoded}`;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const res = await ghAgentFetch(url, {
              headers: authHeaders(options.token),
              redirect: "error",
              timeoutMs: 30_000,
              maxBytes: 5_000_000,
            });
            if (res.status === 403 || res.status === 429) {
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1) ** 2));
              continue;
            }
            if (!res.ok) return { path, content: null as string | null };
            return { path, content: await res.text() };
          } catch {
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
        return { path, content: null };
      }),
    );
    for (const row of results) {
      if (row.content == null) failed.push(row.path);
      else files.push({ path: row.path, content: row.content });
    }
  }

  return {
    owner: options.owner,
    repo: options.repo,
    branch: options.branch,
    files,
    matched,
    truncated,
    failed,
  };
}

export async function fetchGithubMarkdownFiles(options: {
  repository: string;
  branch?: string;
  path?: string;
  token?: string | null;
  maxFiles?: number;
}): Promise<GithubImportResult> {
  const { owner, repo } = parseRepo(options.repository);
  const branch = options.branch?.trim() || "main";
  const root = (options.path ?? "docs").replace(/^\/+|\/+$/g, "");
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;

  // Prefer raw downloads (tree listing + raw.githubusercontent.com): only Markdown
  // bytes, no whole-repo zip, and avoids Contents API rate-limit storms.
  try {
    const viaRaw = await fetchViaRaw({
      owner,
      repo,
      branch,
      root,
      token: options.token,
      maxFiles,
    });
    if (viaRaw.files.length > 0) return viaRaw;
    if (viaRaw.matched === 0) {
      throw new Error(
        `Aucun fichier Markdown trouvé sous « ${root || "/"} » dans ${owner}/${repo}@${branch}.`,
      );
    }
    throw new Error(
      `Aucun contenu récupéré (${viaRaw.failed.length} échec(s)). Ajoutez un jeton GitHub si le dépôt est privé.`,
    );
  } catch (rawError) {
    try {
      const zipBytes = await downloadZipball({
        owner,
        repo,
        branch,
        token: options.token,
      });
      const extracted = extractMarkdownFromZip(zipBytes, root, maxFiles);
      if (extracted.matched === 0) {
        throw new Error(
          `Aucun fichier Markdown trouvé sous « ${root || "/"} » dans ${owner}/${repo}@${branch}.`,
        );
      }
      return {
        owner,
        repo,
        branch,
        files: extracted.files,
        matched: extracted.matched,
        truncated: extracted.truncated,
        failed: [],
      };
    } catch (zipError) {
      const rawMsg =
        rawError instanceof Error ? rawError.message : "raw indisponible";
      const zipMsg =
        zipError instanceof Error ? zipError.message : "zipball indisponible";
      throw new Error(`${rawMsg} | Repli zipball: ${zipMsg}`);
    }
  }
}
