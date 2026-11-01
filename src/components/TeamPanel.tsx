"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
type TeamData = {
  users: {
    id: string;
    email: string;
    name: string;
    role: string;
    disabled: number;
  }[];
  activity: {
    id: number;
    actor: string;
    action: string;
    target: string;
    created_at: string;
  }[];
  backups: { revision: number; created_at: string }[];
};
export function TeamPanel({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/admin/team");
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }
  useEffect(() => {
    let active = true;
    if (admin)
      void fetch("/api/admin/team")
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          if (active) setData(v);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [admin]);
  async function action(path: string, method: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l’opération.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      <button
        className="rounded border border-[var(--line)] px-3 py-2"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        }}
      >
        Se déconnecter
      </button>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {admin && (
        <>
          <section>
            <h2 className="mb-3 text-xl">Comptes</h2>
            <p className="mb-3 text-sm">
              Les administrateurs gèrent les réglages et les comptes. Les
              rédacteurs créent et publient. Les lecteurs consultent les
              documents.
            </p>
            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Compte</th>
                    <th>Rôle</th>
                    <th>Accès</th>
                    <th>Mot de passe</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.users.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--line)]">
                      <td className="py-2">
                        {u.name}
                        <br />
                        <span className="text-xs">{u.email}</span>
                      </td>
                      <td>
                        <select
                          aria-label={`Rôle de ${u.name}`}
                          value={u.role}
                          disabled={busy}
                          onChange={(e) =>
                            void action("/api/admin/team", "PATCH", {
                              id: u.id,
                              role: e.target.value,
                            })
                          }
                        >
                          <option value="admin">Administrateur</option>
                          <option value="editor">Rédacteur</option>
                          <option value="viewer">Lecteur</option>
                        </select>
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action("/api/admin/team", "PATCH", {
                              id: u.id,
                              disabled: !u.disabled,
                            })
                          }
                        >
                          {u.disabled ? "Réactiver" : "Désactiver"}
                        </button>
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const password = window.prompt(
                              "Nouveau mot de passe (12 caractères minimum)",
                            );
                            if (password)
                              void action("/api/admin/team", "PATCH", {
                                id: u.id,
                                password,
                              });
                          }}
                        >
                          Réinitialiser
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              className="mt-6 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                void action(
                  "/api/admin/team",
                  "POST",
                  Object.fromEntries(new FormData(form)),
                ).then(() => form.reset());
              }}
            >
              <label>
                Nom
                <input name="name" required />
              </label>
              <label>
                E-mail
                <input name="email" type="email" required />
              </label>
              <label>
                Mot de passe initial
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Rôle
                <select name="role">
                  <option value="editor">Rédacteur</option>
                  <option value="viewer">Lecteur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
              <button
                disabled={busy}
                className="rounded bg-[var(--accent)] p-2 text-white"
              >
                Ajouter un compte
              </button>
            </form>
          </section>
          <section>
            <h2 className="mb-3 text-xl">Sauvegardes</h2>
            <a
              href="/api/admin/backup"
              className="text-[var(--accent)] underline"
            >
              Télécharger une sauvegarde complète
            </a>
            <p className="my-2 text-sm">
              Les 20 états précédents sont conservés. La restauration remplace
              les documents et les réglages. Conservez aussi la clé de
              chiffrement du serveur.
            </p>
            <div className="flex flex-wrap gap-2">
              {data?.backups.map((b) => (
                <button
                  disabled={busy}
                  className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                  key={b.revision}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Restaurer l’état ${b.revision} du ${b.created_at} ?`,
                      )
                    )
                      void action("/api/admin/backup", "POST", {
                        revision: b.revision,
                      });
                  }}
                >
                  État {b.revision} · {b.created_at}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-xl">Historique d’activité</h2>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {data?.activity.map((a) => (
                <li key={a.id} className="py-2">
                  <time>{a.created_at} UTC</time> · {a.actor} · {a.action} ·{" "}
                  {a.target}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
