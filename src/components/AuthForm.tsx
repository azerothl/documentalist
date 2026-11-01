"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ setup = false }: { setup?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const body = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const response = await fetch(
            `/api/auth/${setup ? "setup" : "login"}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          router.replace(setup ? "/login" : "/app");
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Connexion impossible.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="font-[family-name:var(--font-display)] text-3xl">
        {setup ? "Créer le compte administrateur" : "Connexion à Documentalist"}
      </h1>
      {setup && (
        <>
          <p className="text-sm text-[var(--ink-muted)]">
            Le code d’installation se trouve dans le fichier data/setup-token
            sur le serveur, ou dans DOCUMENTALIST_SETUP_TOKEN.
          </p>
          <label>
            Code d’installation
            <input required name="token" autoComplete="off" type="password" />
          </label>
          <label>
            Nom
            <input required name="name" autoComplete="name" />
          </label>
        </>
      )}
      <label>
        Adresse e-mail
        <input required type="email" name="email" autoComplete="username" />
      </label>
      <label>
        Mot de passe
        <input
          required
          minLength={setup ? 12 : 1}
          maxLength={256}
          type="password"
          name="password"
          autoComplete={setup ? "new-password" : "current-password"}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
      >
        {busy
          ? "Veuillez patienter…"
          : setup
            ? "Créer le compte"
            : "Se connecter"}
      </button>
    </form>
  );
}
