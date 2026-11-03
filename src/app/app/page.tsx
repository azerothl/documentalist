import { clientData } from "@/lib/secrets";
import { WorkspaceApp } from "@/components/WorkspaceApp";
import { listSpaces, getWorkspacePayload } from "@/lib/store";
import { notFound, redirect } from "next/navigation";
import { canAccessSpace, requireUser } from "@/lib/auth";
import { PortalView } from "@/components/PortalView";
import { isSection } from "@/lib/sections";

export const dynamic = "force-dynamic";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{
    space?: string;
    doc?: string;
    lang?: string;
    section?: string;
  }>;
}) {
  const query = await searchParams;
  const user = await requireUser();
  const spaces = (await listSpaces()).filter((space) =>
    canAccessSpace(user, space.id),
  );
  const first = query.space
    ? spaces.find((s) => s.id === query.space)
    : spaces[0];
  if (query.space && !first) notFound();
  if (!first) redirect("/");
  const payload = await getWorkspacePayload(first.id);
  if (!payload) redirect("/");
  payload.spaces = payload.spaces.filter((space) =>
    canAccessSpace(user, space.id),
  );
  payload.versionSpaces = payload.versionSpaces.filter((space) =>
    canAccessSpace(user, space.id),
  );
  if (user.role !== "admin" && user.spaceScope === "selected")
    payload.integrations = [];
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
        path={[]}
        documentId={selected?.id}
        section={isSection(query.section) ? query.section : undefined}
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
      initialSection={isSection(query.section) ? query.section : undefined}
    />
  );
}
