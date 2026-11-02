"use client";
import { useCallback, useEffect, useState } from "react";

export function PortalAccessInvites({ spaceId }: { spaceId: string }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/spaces/${spaceId}/access/invites`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setEmails(result.emails);
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    void fetch(endpoint)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) setEmails(result.emails);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Chargement impossible.",
          );
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  async function change(method: "POST" | "DELETE", targetEmail: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load();
      if (method === "POST") {
        setEmail("");
        setNotice(`Lien d’accès envoyé à ${targetEmail}.`);
      } else {
        setNotice(`Accès retiré pour ${targetEmail}.`);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Opération impossible.",
      );
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[var(--line)] p-3">
      <h3 className="font-medium">Personnes autorisées par lien magique</h3>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        Chaque adresse reçoit un lien personnel valable 24 heures. Les sessions
        d’accès durent 8 heures et sont révoquées quand une personne est
        retirée.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="min-w-48 flex-1">
          Adresse e-mail à inviter
          <input
            form="portal-invite-form"
            type="email"
            value={email}
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
          />
        </label>
        <button
          type="button"
          disabled={busy || !email}
          className="self-end rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--on-accent)]"
          onClick={() => void change("POST", email)}
        >
          {busy ? "Envoi…" : "Inviter et envoyer le lien"}
        </button>
      </div>
      {emails.length ? (
        <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
          {emails.map((address) => (
            <li
              key={address}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>{address}</span>
              <button
                type="button"
                disabled={busy}
                className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                onClick={() => void change("DELETE", address)}
              >
                Retirer l’accès
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          Aucune invitation.
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
