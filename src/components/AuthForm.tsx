"use client";
import { AppearanceSettings } from "@/components/Appearance";
import { BrandLogo } from "@/components/BrandLogo";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ setup = false }: { setup?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 flex justify-center">
        <BrandLogo height={44} priority />
      </div>
      <form
        className="card mx-auto flex w-full max-w-md flex-col gap-4"
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
        <h1 className="text-3xl font-bold text-[var(--heading)]">
          {setup
            ? "Créer le compte administrateur"
            : "Connexion à Documentalist"}
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
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary-button mt-2 min-h-11">
          {busy
            ? "Veuillez patienter…"
            : setup
              ? "Créer le compte"
              : "Se connecter"}
        </button>
      </form>
      <div className="mt-4 flex justify-center">
        <AppearanceSettings />
      </div>
    </div>
  );
}
