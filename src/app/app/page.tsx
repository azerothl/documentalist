import { WorkspaceApp } from "@/components/WorkspaceApp";
import { listSpaces, getWorkspacePayload } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const spaces = await listSpaces();
  const first = spaces[0];
  if (!first) redirect("/");
  const payload = await getWorkspacePayload(first.id);
  if (!payload) redirect("/");
  return <WorkspaceApp initial={payload} />;
}
