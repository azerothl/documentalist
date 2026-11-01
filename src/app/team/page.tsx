import Link from "next/link";
import { AppearanceSettings } from "@/components/Appearance";
import { requireUser } from "@/lib/auth";
import { TeamPanel } from "@/components/TeamPanel";
export const dynamic = "force-dynamic";
export default async function Team() {
  const user = await requireUser();
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <Link href="/app" className="text-[var(--accent)]">
        ← Retour à la rédaction
      </Link>
      <div className="mt-4">
        <AppearanceSettings />
      </div>
      <h1 className="my-6 font-[family-name:var(--font-display)] text-3xl">
        Équipe et activité
      </h1>
      <TeamPanel admin={user.role === "admin"} />
    </main>
  );
}
