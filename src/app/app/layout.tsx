import Link from "next/link";
import { requireUser } from "@/lib/auth";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <nav
        aria-label="Compte"
        className="flex items-center justify-end gap-4 border-b border-[var(--line)] px-4 py-1 text-xs"
      >
        <span>
          {user.name} ·{" "}
          {
            { admin: "Administrateur", editor: "Rédacteur", viewer: "Lecteur" }[
              user.role
            ]
          }
        </span>
        <Link href="/team">Équipe et activité</Link>
      </nav>
      {children}
    </>
  );
}
