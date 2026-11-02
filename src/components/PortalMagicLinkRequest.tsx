"use client";
import { useState } from "react";
import { AppearanceSettings } from "@/components/Appearance";
import { PortalLocaleSync } from "@/components/PortalLocaleSync";
import { getPortalUi } from "@/lib/portal-i18n";

export function PortalMagicLinkRequest({
  slug,
  name,
  locale = "fr",
}: {
  slug: string;
  name: string;
  locale?: string;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { language, messages } = getPortalUi(locale);
  const t = messages.magicLinkRequest;
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
        onSubmit={async (event) => {
          event.preventDefault();
          const email = String(
            new FormData(event.currentTarget).get("email") ?? "",
          );
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const response = await fetch("/api/portal/magic-link/request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, email }),
            });
            if (!response.ok) {
              setError(response.status === 429 ? t.rateLimited : t.unavailable);
              return;
            }
            setMessage(t.sent);
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
          {t.email}
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
          />
        </label>
        {error ? (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        <button
          disabled={busy}
          className="rounded bg-[var(--accent)] p-2 text-[var(--on-accent)]"
        >
          {busy ? t.sending : t.submit}
        </button>
      </form>
      <div className="mx-auto w-full max-w-sm">
        <AppearanceSettings locale={locale} />
      </div>
    </main>
  );
}
