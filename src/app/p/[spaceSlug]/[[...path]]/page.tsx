import { publicPortalData } from "@/lib/portal";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalView } from "@/components/PortalView";
import { getSpace, listSpaces, listVariables } from "@/lib/store";
import { findByPath, firstReadablePage } from "@/lib/tree";
import { defaultSection, isSection, sectionDocuments } from "@/lib/sections";
import type { DocSection, DocumentRecord } from "@/lib/types";
import { portalAllowed } from "@/lib/auth";
import { PortalUnlock } from "@/components/PortalUnlock";

export const dynamic = "force-dynamic";

/**
 * /p/{space}/{learn|reference|blog}/{...slugs}. Older links without a tab
 * segment keep pointing at Reference.
 */
function resolvePath(path: string[]): {
  section: DocSection | undefined;
  slugs: string[];
} {
  if (isSection(path[0])) return { section: path[0], slugs: path.slice(1) };
  return { section: path.length ? "reference" : undefined, slugs: path };
}

function findDocument(
  docs: DocumentRecord[],
  section: DocSection | undefined,
  slugs: string[],
) {
  if (!section) return firstReadablePage(docs);
  const inSection = sectionDocuments(docs, section);
  return slugs.length
    ? findByPath(inSection, slugs)
    : firstReadablePage(inSection);
}

type Props = {
  params: Promise<{ spaceSlug: string; path?: string[] }>;
  searchParams: Promise<{ lang?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { spaceSlug, path = [] } = await params;
  const { lang } = await searchParams;
  const space = await getSpace(spaceSlug);
  if (!space?.publishedSnapshot || !space.isPublic)
    return { title: "Page introuvable" };
  if (!(await portalAllowed(space.id, space.accessPassword)))
    return {
      title: "Portail protégé",
      robots: { index: false, follow: false },
    };
  const locale = lang || space.defaultLocale || "en";
  const { documents: docs } = publicPortalData(
    space,
    await listVariables(),
    locale,
  );
  const resolved = resolvePath(path);
  const section = resolved.section ?? defaultSection(docs);
  const slugs = resolved.slugs;
  const blogIndex = section === "blog" && !slugs.length;
  const doc = blogIndex
    ? undefined
    : (findDocument(docs, section, slugs) ?? firstReadablePage(docs));
  return {
    title: blogIndex
      ? `Blog — ${space.name}`
      : doc?.seoTitle || doc?.title || space.name,
    description: doc?.seoDescription || space.description,
  };
}

export default async function PortalDocPage({ params, searchParams }: Props) {
  const { spaceSlug, path = [] } = await params;
  const { lang } = await searchParams;
  const space = await getSpace(spaceSlug);
  if (!space?.publishedSnapshot || !space.isPublic) notFound();
  const locale = lang || space.defaultLocale || "en";
  if (!(await portalAllowed(space.id, space.accessPassword)))
    return (
      <PortalUnlock slug={space.slug} name={space.name} locale={locale} />
    );
  const allVariables = await listVariables();
  const all = await listSpaces();
  const versionSpaces = all
    .filter(
      (s) =>
        s.versionGroupId === space.versionGroupId &&
        s.publishedSnapshot &&
        s.isPublic,
    )
    .map((s) => ({ id: s.id, slug: s.slug, versionLabel: s.versionLabel }));
  const { space: publicSpace, documents } = publicPortalData(
    space,
    allVariables,
    locale,
  );
  const { section, slugs } = resolvePath(path);
  if (slugs.length && !findDocument(documents, section, slugs)) notFound();
  return (
    <PortalView
      space={publicSpace}
      versionSpaces={
        versionSpaces.length
          ? versionSpaces
          : [
              {
                id: space.id,
                slug: space.slug,
                versionLabel: space.versionLabel,
              },
            ]
      }
      documents={documents}
      variables={[]}
      path={slugs}
      section={section}
      locale={locale}
    />
  );
}
