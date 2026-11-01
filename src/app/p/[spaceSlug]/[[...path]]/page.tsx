import { publicPortalData } from "@/lib/portal";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalView } from "@/components/PortalView";
import { getSpace, listSpaces, listVariables } from "@/lib/store";
import { findByPath, firstReadablePage } from "@/lib/tree";
import { portalAllowed } from "@/lib/auth";
import { PortalUnlock } from "@/components/PortalUnlock";

export const dynamic = "force-dynamic";

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
  const doc =
    (path.length ? findByPath(docs, path) : firstReadablePage(docs)) ??
    firstReadablePage(docs);
  return {
    title: doc?.seoTitle || doc?.title || space.name,
    description: doc?.seoDescription || space.description,
  };
}

export default async function PortalDocPage({ params, searchParams }: Props) {
  const { spaceSlug, path = [] } = await params;
  const { lang } = await searchParams;
  const space = await getSpace(spaceSlug);
  if (!space?.publishedSnapshot || !space.isPublic) notFound();
  if (!(await portalAllowed(space.id, space.accessPassword)))
    return <PortalUnlock slug={space.slug} name={space.name} />;
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
  const locale = lang || space.defaultLocale || "en";
  const { space: publicSpace, documents } = publicPortalData(
    space,
    allVariables,
    locale,
  );
  if (path.length && !findByPath(documents, path)) notFound();
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
      path={path}
      locale={locale}
    />
  );
}
