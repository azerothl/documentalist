"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { McpConnections } from "./McpConnections";
type TeamData = {
  spaces: { id: string; name: string }[];
  users: {
    id: string;
    email: string;
    name: string;
    role: string;
    disabled: number;
    password_set: number;
    spaceScope: "all" | "selected";
    spaceIds: string[];
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
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteScope, setInviteScope] = useState<"all" | "selected">("selected");
  const [inviteSpaceIds, setInviteSpaceIds] = useState<string[]>([]);
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
          if (active) {
            setData(v);
            setInviteSpaceIds(
              (v as TeamData).spaces.slice(0, 1).map((space) => space.id),
            );
          }
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
      await load().catch(() => undefined);
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
        <p role="alert" className="text-[var(--danger)]">
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
                    <th>Utilisateur</th>
                    <th>Espaces accessibles</th>
                    <th>Rôle</th>
                    <th>Accès</th>
                    <th>Statut et lien</th>
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
                      <td className="min-w-56 py-2">
                        {u.role === "admin" ? (
                          <span>Tous les espaces (administrateur)</span>
                        ) : (
                          <>
                            <select
                              aria-label={`Espaces accessibles à ${u.name}`}
                              value={u.spaceScope}
                              disabled={busy}
                              onChange={(e) => {
                                const scope = e.target.value as "all" | "selected";
                                void action("/api/admin/team", "PATCH", {
                                  id: u.id,
                                  spaceScope: scope,
                                  spaceIds:
                                    scope === "selected"
                                      ? u.spaceScope === "selected"
                                        ? u.spaceIds
                                        : data?.spaces.slice(0, 1).map((s) => s.id) ?? []
                                      : [],
                                });
                              }}
                            >
                              <option value="all">Tous les espaces</option>
                              <option value="selected">Espaces sélectionnés</option>
                            </select>
                            {u.spaceScope === "selected" && (
                              <fieldset className="mt-2 grid gap-1">
                                <legend className="text-xs text-[var(--ink-muted)]">
                                  Cochez les espaces autorisés
                                </legend>
                                {data?.spaces.map((space) => (
                                  <label key={space.id} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={u.spaceIds.includes(space.id)}
                                      disabled={busy || (u.spaceIds.length === 1 && u.spaceIds.includes(space.id))}
                                      onChange={(e) => {
                                        const spaceIds = e.target.checked
                                          ? [...u.spaceIds, space.id]
                                          : u.spaceIds.filter((id) => id !== space.id);
                                        void action("/api/admin/team", "PATCH", {
                                          id: u.id,
                                          spaceScope: "selected",
                                          spaceIds,
                                        });
                                      }}
                                    />
                                    {space.name}
                                  </label>
                                ))}
                              </fieldset>
                            )}
                          </>
                        )}
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
                          onClick={() =>
                            void action("/api/admin/team/resend", "POST", {
                              id: u.id,
                            })
                          }
                        >
                          {u.password_set
                            ? "Envoyer un lien de réinitialisation"
                            : "Renvoyer l’invitation"}
                        </button>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {u.password_set
                            ? "Mot de passe défini"
                            : "Invitation en attente"}
                        </p>
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
                  {
                    ...Object.fromEntries(new FormData(form)),
                    spaceScope: inviteScope,
                    spaceIds: inviteScope === "selected" ? inviteSpaceIds : [],
                  },
                ).then(() => {
                  form.reset();
                  setInviteRole("editor");
                  setInviteScope("selected");
                  setInviteSpaceIds(data?.spaces.slice(0, 1).map((space) => space.id) ?? []);
                });
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
                Rôle
                <select
                  name="role"
                  value={inviteRole}
                  onChange={(e) => {
                    setInviteRole(e.target.value);
                    if (e.target.value === "admin") setInviteScope("all");
                    else if (inviteScope === "all") setInviteScope("selected");
                  }}
                >
                  <option value="editor">Rédacteur</option>
                  <option value="viewer">Lecteur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
              <label>
                Espaces accessibles
                <select
                  name="spaceScope"
                  value={inviteScope}
                  disabled={inviteRole === "admin"}
                  onChange={(e) =>
                    setInviteScope(e.target.value as "all" | "selected")
                  }
                >
                  <option value="selected">Espaces sélectionnés</option>
                  <option value="all">Tous les espaces</option>
                </select>
              </label>
              {inviteRole !== "admin" && inviteScope === "selected" && (
                <fieldset className="grid gap-1 sm:col-span-2">
                  <legend>Choisissez les espaces accessibles</legend>
                  {data?.spaces.map((space) => (
                    <label key={space.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="spaceIds"
                        value={space.id}
                        checked={inviteSpaceIds.includes(space.id)}
                        onChange={(e) =>
                          setInviteSpaceIds((current) =>
                            e.target.checked
                              ? [...current, space.id]
                              : current.filter((id) => id !== space.id),
                          )
                        }
                      />
                      {space.name}
                    </label>
                  ))}
                  {!data?.spaces.length && (
                    <p className="text-sm text-[var(--ink-muted)]">
                      Créez d’abord un espace avant d’inviter un compte limité.
                    </p>
                  )}
                </fieldset>
              )}
              <button
                disabled={
                  busy ||
                  (inviteScope === "selected" && inviteSpaceIds.length === 0)
                }
                className="rounded bg-[var(--accent)] p-2 text-[var(--on-accent)]"
              >
                Inviter un compte par e-mail
              </button>
            </form>
          </section>
          <section>
            <McpConnections users={data?.users ?? []} spaces={data?.spaces ?? []} />
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
