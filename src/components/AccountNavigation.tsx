"use client";

import Link from "next/link";
import { AppearanceSettings } from "@/components/Appearance";
import { getPortalUi } from "@/lib/portal-i18n";

export type AccountIdentity = {
  name: string;
  role: "admin" | "editor" | "viewer";
};

export function AccountNavigation({
  user,
  locale = "fr",
}: {
  user: AccountIdentity;
  locale?: string;
}) {
  const { language, messages } = getPortalUi(locale);
  const t = messages.account;
  return (
    <nav
      aria-label={t.navigation}
      lang={language}
      className="account-navigation"
    >
      <span className="account-identity">
        {user.name} ·{" "}
        {t[user.role]}
      </span>
      <Link href="/team">{t.team}</Link>
      <AppearanceSettings variant="icon" locale={locale} />
    </nav>
  );
}
