import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalView } from "@/components/PortalView";
import { getSpace, listSpaces, listVariables } from "@/lib/store";
import { findByPath, firstReadablePage } from "@/lib/tree";

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
  if (!space?.publishedSnapshot) return { title: "Not found" };
  const locale = lang || space.defaultLocale || "en";
  const docs = space.publishedSnapshot.documents.filter(
    (d) => !d.hidden && d.locale === locale,
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
  if (!space?.publishedSnapshot) notFound();
  const variables = await listVariables();
  const all = await listSpaces();
  const versionSpaces = all.filter(
    (s) => s.versionGroupId === space.versionGroupId && s.publishedSnapshot,
  );
  const locale = lang || space.defaultLocale || "en";
  return (
    <PortalView
      space={space}
      versionSpaces={versionSpaces.length ? versionSpaces : [space]}
      documents={space.publishedSnapshot.documents}
      variables={variables}
      path={path}
      locale={locale}
    />
  );
}
