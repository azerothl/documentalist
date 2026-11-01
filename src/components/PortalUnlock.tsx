"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function PortalUnlock({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center px-4">
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
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Accès impossible.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="font-[family-name:var(--font-display)] text-2xl">
          {name}
        </h1>
        <p>Ce portail est protégé par un mot de passe.</p>
        <label>
          Mot de passe
          <input
            required
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded bg-[var(--accent)] p-2 text-white"
        >
          {busy ? "Vérification…" : "Ouvrir le portail"}
        </button>
      </form>
    </main>
  );
}
