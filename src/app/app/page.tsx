import { clientData } from "@/lib/secrets";
import { WorkspaceApp } from "@/components/WorkspaceApp";
import { listSpaces, getWorkspacePayload } from "@/lib/store";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DocumentContent } from "@/components/DocumentContent";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await requireUser();
  const spaces = await listSpaces();
  const first = spaces[0];
  if (!first) redirect("/");
  const payload = await getWorkspacePayload(first.id);
  if (!payload) redirect("/");
  if (user.role === "viewer")
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl">
          Documentation en lecture seule
        </h1>
        {await Promise.all(
          spaces.map(async (space) => {
            const p = await getWorkspacePayload(space.id);
            return (
              <section key={space.id}>
                <h2 className="mb-3 text-2xl">{space.name}</h2>
                {p?.documents
                  .filter((d) => d.kind === "page")
                  .map((d) => (
                    <details
                      key={d.id}
                      className="mb-2 rounded border border-[var(--line)] p-3"
                    >
                      <summary className="cursor-pointer">
                        {d.title} · {d.locale}
                      </summary>
                      <DocumentContent content={d.content} />
                    </details>
                  ))}
              </section>
            );
          }),
        )}
      </main>
    );
  return (
    <WorkspaceApp
      initial={clientData(payload)}
      isAdmin={user.role === "admin"}
    />
  );
}
