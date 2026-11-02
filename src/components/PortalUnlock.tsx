"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppearanceSettings } from "@/components/Appearance";
import { PortalLocaleSync } from "@/components/PortalLocaleSync";
import { getPortalUi } from "@/lib/portal-i18n";
export function PortalUnlock({
  slug,
  name,
  locale = "fr",
}: {
  slug: string;
  name: string;
  locale?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { language, messages } = getPortalUi(locale);
  const t = messages.unlock;
  return (
    <main
      id="main-content"
      lang={language}
      tabIndex={-1}
      className="flex min-h-dvh flex-col justify-center gap-4 px-4"
    >
      <PortalLocaleSync
        language={language}
        skipLinkLabel={messages.skipToContent}
      />
      <form
        className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const password = new FormData(e.currentTarget).get("password");
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/portal/unlock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, password }),
            });
            if (!r.ok) {
              setError(
                r.status === 429
                  ? t.rateLimited
                  : r.status === 403
                    ? t.incorrect
                    : t.unavailable,
              );
              return;
            }
            router.refresh();
          } catch {
            setError(t.unavailable);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="font-[family-name:var(--font-display)] text-2xl">
          {name}
        </h1>
        <p>{t.description}</p>
        <label>
          {t.password}
          <input
            required
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
          />
        </label>
        {error && (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded bg-[var(--accent)] p-2 text-[var(--on-accent)]"
        >
          {busy ? t.checking : t.open}
        </button>
      </form>
      <div className="mx-auto w-full max-w-sm">
        <AppearanceSettings locale={locale} />
      </div>
    </main>
  );
}
