"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PortalMagicLinkConfirm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/portal/magic-link/consume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          router.replace(`/p/${result.slug}`);
          router.refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Lien invalide.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="font-[family-name:var(--font-display)] text-2xl">
        Accéder à la documentation
      </h1>
      <p>Confirmez l’ouverture du lien personnel pour continuer.</p>
      {error ? (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <button
        disabled={busy}
        className="rounded bg-[var(--accent)] p-2 text-[var(--on-accent)]"
      >
        {busy ? "Vérification…" : "Ouvrir la documentation"}
      </button>
    </form>
  );
}
