import { clientData } from "@/lib/secrets";
import { WorkspaceApp } from "@/components/WorkspaceApp";
import { listSpaces, getWorkspacePayload } from "@/lib/store";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PortalView } from "@/components/PortalView";
import { pathSlugs } from "@/lib/tree";

export const dynamic = "force-dynamic";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; doc?: string; lang?: string }>;
}) {
  const query = await searchParams;
  const user = await requireUser();
  const spaces = await listSpaces();
  const first = spaces.find((s) => s.id === query.space) ?? spaces[0];
  if (!first) redirect("/");
  const payload = await getWorkspacePayload(first.id);
  if (!payload) redirect("/");
  const requestedDocument = payload.documents.find((d) => d.id === query.doc);
  const locale = payload.space.locales.includes(query.lang ?? "")
    ? query.lang!
    : (requestedDocument?.locale ?? payload.space.defaultLocale);
  const selected =
    requestedDocument?.locale === locale ? requestedDocument : undefined;
  if (user.role === "viewer") {
    const { id, name, slug, accentColor, locales } = payload.space;
    return (
      <PortalView
        key={`${id}:${locale}:${selected?.id ?? ""}`}
        internal
        account={{ name: user.name, role: user.role }}
        space={{ id, name, slug, accentColor, locales }}
        documents={payload.documents}
        variables={payload.variables}
        availableSpaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
        versionSpaces={spaces
          .filter((s) => s.versionGroupId === first.versionGroupId)
          .map((s) => ({
            id: s.id,
            slug: s.slug,
            versionLabel: s.versionLabel,
          }))}
        path={selected ? pathSlugs(payload.documents, selected.id) : []}
        locale={locale}
      />
    );
  }
  return (
    <WorkspaceApp
      initial={clientData(payload)}
      isAdmin={user.role === "admin"}
      account={{ name: user.name, role: user.role }}
      initialDocumentId={selected?.id}
      initialLocale={locale}
    />
  );
}
