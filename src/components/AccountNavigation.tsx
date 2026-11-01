"use client";

import Link from "next/link";
import { AppearanceSettings } from "@/components/Appearance";

export type AccountIdentity = {
  name: string;
  role: "admin" | "editor" | "viewer";
};

export function AccountNavigation({ user }: { user: AccountIdentity }) {
  return (
    <nav aria-label="Compte" className="account-navigation">
      <span className="account-identity">
        {user.name} ·{" "}
        {
          { admin: "Administrateur", editor: "Rédacteur", viewer: "Lecteur" }[
            user.role
          ]
        }
      </span>
      <Link href="/team">Équipe et activité</Link>
      <AppearanceSettings variant="icon" />
    </nav>
  );
}
