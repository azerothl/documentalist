"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <form
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        if (password !== String(form.get("confirm") ?? "")) {
          setError("Les deux mots de passe ne correspondent pas.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/auth/account-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setDone(true);
          window.history.replaceState(null, "", "/account/activate");
          window.setTimeout(() => router.replace("/login"), 1800);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Impossible d’enregistrer le mot de passe.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="font-[family-name:var(--font-display)] text-2xl">
        Définir votre mot de passe
      </h1>
      <p>Choisissez un mot de passe de 12 caractères minimum.</p>
      <label>
        Nouveau mot de passe
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirmer le mot de passe
        <input
          name="confirm"
          type="password"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      {error ? (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status">
          Mot de passe enregistré. Redirection vers la connexion…
        </p>
      ) : null}
      <button
        disabled={busy || done}
        className="rounded bg-[var(--accent)] p-2 text-[var(--on-accent)]"
      >
        {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}
