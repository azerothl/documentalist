import type { DocumentRecord, Space } from "./types";

export const GITHUB_READ_ONLY_MESSAGE =
  "Cette page est synchronisée depuis GitHub. Modifiez-la dans le dépôt, puis relancez la synchronisation.";

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function isGitHubImportedDocument(
  space: Pick<Space, "importSource">,
  document:
    | (Pick<DocumentRecord, "sourcePath"> &
        Partial<Pick<DocumentRecord, "translationOf">>)
    | null
    | undefined,
): boolean {
  const sourcePath = document?.sourcePath;
  const source = space.importSource;
  if (
    !sourcePath ||
    document?.translationOf ||
    source?.provider !== "github"
  ) {
    return false;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(sourcePath)) return false;

  const documentPath = normalizeRepositoryPath(sourcePath);
  const roots = [source.path, source.learnPath, source.blogPath]
    .filter((root): root is string => Boolean(root))
    .map(normalizeRepositoryPath);
  return (
    roots.length === 0 ||
    roots.some(
      (root) => documentPath === root || documentPath.startsWith(`${root}/`),
    )
  );
}

export class GitHubReadOnlyDocumentError extends Error {
  constructor() {
    super(GITHUB_READ_ONLY_MESSAGE);
    this.name = "GitHubReadOnlyDocumentError";
  }
}
