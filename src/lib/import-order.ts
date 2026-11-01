/** Ordering helpers for third-party Markdown imports (GitHub/GitLab/…). */

export type ImportOrderFile = {
  path: string;
  content: string;
};

export type ImportOrderEntry = {
  path: string;
  /** Explicit walk order from SUMMARY or README crawl; lower first */
  linkIndex: number | null;
  frontmatterOrder: number | null;
  numericPrefix: number | null;
};

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)|<([^>\s]+\.(?:md|mdx|markdown)(?:#[^>\s]*)?)>/gi;
const ORDER_FM_KEYS = [
  "sidebar_position",
  "sidebar_order",
  "nav_order",
  "order",
  "position",
] as const;

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function frontmatterOrder(
  frontmatter: Record<string, string>,
): number | null {
  for (const key of ORDER_FM_KEYS) {
    const raw = frontmatter[key];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function numericPrefixOrder(name: string): number | null {
  const base = name.split("/").pop() || name;
  const match = base.match(/^(\d+)(?:[-_.\s]|$)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function stripAnchor(href: string): string {
  const hash = href.indexOf("#");
  return hash >= 0 ? href.slice(0, hash) : href;
}

function isExternalHref(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

/** Resolve a relative Markdown href against a file directory. */
export function resolveMarkdownHref(
  fromDir: string,
  href: string,
): string | null {
  let target = stripAnchor(href.trim()).replace(/\\/g, "/");
  if (!target || isExternalHref(target) || target.startsWith("/")) return null;
  target = target.replace(/^\.\//, "");
  const parts = (fromDir ? fromDir.split("/") : []).filter(Boolean);
  for (const seg of target.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  let resolved = parts.join("/");
  if (!/\.(md|mdx|markdown)$/i.test(resolved)) {
    // Directory-style link → README/index preferred later via lookup
    resolved = `${resolved}/README.md`;
  }
  return resolved;
}

function extractMarkdownHrefs(content: string): string[] {
  const hrefs: string[] = [];
  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(content))) {
    const href = (match[2] || match[3] || "").trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function findExistingPath(
  candidate: string,
  pathSet: Set<string>,
  pathByLower: Map<string, string>,
): string | null {
  if (pathSet.has(candidate)) return candidate;
  const lower = pathByLower.get(candidate.toLowerCase());
  if (lower) return lower;
  // Try index.md variants when we appended README.md for a folder link
  if (/\/README\.md$/i.test(candidate)) {
    const base = candidate.replace(/\/README\.md$/i, "");
    for (const name of ["index.md", "Index.md", "INDEX.md", "readme.md"]) {
      const alt = base ? `${base}/${name}` : name;
      if (pathSet.has(alt)) return alt;
      const found = pathByLower.get(alt.toLowerCase());
      if (found) return found;
    }
  }
  return null;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

/**
 * Order from GitBook-style SUMMARY.md: first-seen relative Markdown links.
 */
export function parseSummaryOrder(
  content: string,
  summaryPath: string,
  pathSet: Set<string>,
  pathByLower: Map<string, string>,
): Map<string, number> {
  const order = new Map<string, number>();
  const baseDir = dirOf(summaryPath);
  let index = 0;
  for (const href of extractMarkdownHrefs(content)) {
    const resolved = resolveMarkdownHref(baseDir, href);
    if (!resolved) continue;
    const existing = findExistingPath(resolved, pathSet, pathByLower);
    if (!existing || order.has(existing)) continue;
    order.set(existing, index++);
  }
  return order;
}

function findEntryFile(
  rootPrefix: string,
  names: string[],
  pathByLower: Map<string, string>,
): string | null {
  for (const name of names) {
    const candidate = rootPrefix ? `${rootPrefix}/${name}` : name;
    const found = pathByLower.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

/**
 * BFS from README/index at the import root, following relative Markdown links
 * that resolve to files present in the import set.
 */
export function orderFromReadmeCrawl(
  files: ImportOrderFile[],
  rootPrefix: string,
): Map<string, number> {
  const pathSet = new Set(files.map((f) => f.path));
  const pathByLower = new Map(
    files.map((f) => [f.path.toLowerCase(), f.path] as const),
  );
  const contentByPath = new Map(files.map((f) => [f.path, f.content] as const));

  const entry = findEntryFile(
    rootPrefix,
    ["README.md", "readme.md", "index.md", "Index.md", "INDEX.md"],
    pathByLower,
  );
  if (!entry) return new Map();

  const order = new Map<string, number>();
  const queue: string[] = [entry];
  order.set(entry, 0);
  let nextIndex = 1;

  while (queue.length) {
    const current = queue.shift()!;
    const content = contentByPath.get(current);
    if (content == null) continue;
    const baseDir = dirOf(current);
    for (const href of extractMarkdownHrefs(content)) {
      const resolved = resolveMarkdownHref(baseDir, href);
      if (!resolved) continue;
      const existing = findExistingPath(resolved, pathSet, pathByLower);
      if (!existing || order.has(existing)) continue;
      order.set(existing, nextIndex++);
      queue.push(existing);
    }
  }

  return order;
}

/** Build link-order map: SUMMARY wins, else README crawl. */
export function buildLinkOrderMap(
  files: ImportOrderFile[],
  rootPrefix: string,
): Map<string, number> {
  const pathByLower = new Map(
    files.map((f) => [f.path.toLowerCase(), f.path] as const),
  );
  const pathSet = new Set(files.map((f) => f.path));

  const summaryPath =
    findEntryFile(rootPrefix, ["SUMMARY.md", "summary.md"], pathByLower) ??
    findEntryFile("", ["SUMMARY.md", "summary.md"], pathByLower);

  if (summaryPath) {
    const content = files.find((f) => f.path === summaryPath)?.content;
    if (content) {
      const fromSummary = parseSummaryOrder(
        content,
        summaryPath,
        pathSet,
        pathByLower,
      );
      if (fromSummary.size) return fromSummary;
    }
  }

  return orderFromReadmeCrawl(files, rootPrefix);
}

export function compareImportEntries(
  a: ImportOrderEntry,
  b: ImportOrderEntry,
): number {
  const aLinked = a.linkIndex != null;
  const bLinked = b.linkIndex != null;
  if (aLinked && bLinked) return a.linkIndex! - b.linkIndex!;
  if (aLinked !== bLinked) return aLinked ? -1 : 1;

  if (a.frontmatterOrder != null && b.frontmatterOrder != null) {
    if (a.frontmatterOrder !== b.frontmatterOrder) {
      return a.frontmatterOrder - b.frontmatterOrder;
    }
  } else if (a.frontmatterOrder != null || b.frontmatterOrder != null) {
    return a.frontmatterOrder != null ? -1 : 1;
  }

  if (a.numericPrefix != null && b.numericPrefix != null) {
    if (a.numericPrefix !== b.numericPrefix) {
      return a.numericPrefix - b.numericPrefix;
    }
  } else if (a.numericPrefix != null || b.numericPrefix != null) {
    return a.numericPrefix != null ? -1 : 1;
  }

  return naturalCompare(a.path, b.path);
}

export function sortImportFiles(
  files: ImportOrderFile[],
  rootPrefix: string,
  frontmatterByPath: Map<string, Record<string, string>>,
): ImportOrderFile[] {
  const linkOrder = buildLinkOrderMap(files, rootPrefix);
  const entries: ImportOrderEntry[] = files.map((f) => {
    const base = f.path.split("/").pop() || f.path;
    return {
      path: f.path,
      linkIndex: linkOrder.has(f.path) ? linkOrder.get(f.path)! : null,
      frontmatterOrder: frontmatterOrder(frontmatterByPath.get(f.path) ?? {}),
      numericPrefix: numericPrefixOrder(base),
    };
  });
  entries.sort(compareImportEntries);
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  return entries.map((e) => byPath.get(e.path)!);
}

/** Order key for a folder path (numeric prefix on the leaf segment). */
export function folderSortKey(dirPath: string): ImportOrderEntry {
  const leaf = dirPath.split("/").pop() || dirPath;
  return {
    path: dirPath,
    linkIndex: null,
    frontmatterOrder: null,
    numericPrefix: numericPrefixOrder(leaf),
  };
}
