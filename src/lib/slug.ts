const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  let slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
  if (!slug || !SLUG_RE.test(slug)) slug = "untitled";
  return slug;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 100;
}

export function uniqueSlug(
  base: string,
  existing: Iterable<string>,
  reserved?: string,
): string {
  const taken = new Set(existing);
  if (reserved) taken.delete(reserved);
  const slug = slugify(base);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}
