"use client";
import { useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  spaceScope: string;
  spaceIds: string[];
  disabled: number;
  password_set: number;
};
type Connection = {
  id: string;
  name: string;
  email: string;
  spaceIds: string[];
  expires_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
  expired: boolean;
};
export function McpConnections({
  users,
  spaces,
}: {
  users: Member[];
  spaces: { id: string; name: string }[];
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [userId, setUserId] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [endpoint, setEndpoint] = useState("/mcp");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const user = users.find((u) => u.id === userId);
  const available = spaces.filter(
    (s) =>
      user &&
      (user.role === "admin" ||
        user.spaceScope === "all" ||
        user.spaceIds.includes(s.id)),
  );
  async function load() {
    const response = await fetch("/api/mcp/connections");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setConnections(body.connections);
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/mcp/connections")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (active) {
          setConnections(body.connections);
          setEndpoint(`${window.location.origin}/mcp`);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/mcp/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setConfiguration("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la révocation.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-xl">Accès des agents (MCP)</h2>
      <p className="text-sm">
        Les agents consultent les pages publiées, en lecture seule. Sans clé,
        seules les documentations publiques sont accessibles. Chaque clé privée
        est limitée aux espaces cochés et aux droits actuels du compte associé.
      </p>
      <p>
        Adresse du serveur : <code>{endpoint}</code>
      </p>
      <p className="text-sm text-[var(--ink-muted)]">
        Utilisez un client MCP qui accepte une URL HTTP et un en-tête
        Authorization Bearer. La connexion OAuth interactive n’est pas
        disponible.
      </p>
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          setBusy(true);
          setError("");
          setConfiguration("");
          try {
            const response = await fetch("/api/mcp/connections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: fields.get("name"),
                userId,
                days: Number(fields.get("days")),
                spaceIds: fields.getAll("spaceIds"),
              }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error);
            setConfiguration(
              JSON.stringify(
                {
                  mcpServers: {
                    documentalist: {
                      url: `${window.location.origin}/mcp`,
                      headers: { Authorization: `Bearer ${body.accessKey}` },
                    },
                  },
                },
                null,
                2,
              ),
            );
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Échec de la création.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nom de la connexion
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Agent de support"
            disabled={busy}
          />
        </label>
        <label>
          Compte associé
          <select
            required
            value={userId}
            disabled={busy}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Choisir un compte</option>
            {users
              .filter((u) => !u.disabled && u.password_set)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
          </select>
        </label>
        <label>
          Durée de validité
          <select name="days" defaultValue="90" disabled={busy}>
            <option value="7">7 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
            <option value="365">1 an</option>
          </select>
        </label>
        <fieldset key={userId} disabled={busy} className="space-y-1">
          <legend>Espaces autorisés</legend>
          {available.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input type="checkbox" name="spaceIds" value={s.id} />
              {s.name}
            </label>
          ))}
          {userId && !available.length && (
            <p>Ce compte n’a accès à aucun espace.</p>
          )}
        </fieldset>
        <button
          className="rounded bg-[var(--accent)] p-2 text-[var(--on-accent)]"
          disabled={busy || !userId || !available.length}
        >
          Créer une clé de lecture
        </button>
      </form>
      {configuration && (
        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p>
            Copiez cette configuration maintenant : la clé ne sera plus affichée
            après fermeture ou rechargement.
          </p>
          <label className="block">
            Configuration du client MCP
            <textarea
              className="mt-2 w-full font-mono text-xs"
              rows={12}
              readOnly
              value={configuration}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => setConfiguration("")}
          >
            Masquer la clé
          </button>
        </div>
      )}
      <ul className="divide-y divide-[var(--line)]">
        {connections.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2"
          >
            <div>
              <strong>{c.name}</strong> · {c.email}
              <p className="text-sm">
                {c.spaceIds
                  .map(
                    (id) =>
                      spaces.find((s) => s.id === id)?.name ??
                      "Espace supprimé",
                  )
                  .join(", ")}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">
                {c.revoked_at
                  ? "Révoquée"
                  : c.expired
                    ? "Expirée"
                    : `Expire le ${new Date(c.expires_at).toLocaleDateString("fr-FR")}`}{" "}
                ·{" "}
                {c.last_used_at
                  ? `Dernier accès : ${new Date(c.last_used_at).toLocaleString("fr-FR")}`
                  : "Jamais utilisée"}
              </p>
            </div>
            {!c.revoked_at && (
              <button
                disabled={busy}
                className="secondary-button"
                onClick={() => void revoke(c.id)}
                aria-label={`Révoquer ${c.name}`}
              >
                Révoquer
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
