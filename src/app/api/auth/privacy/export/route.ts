import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/api";
import { currentUser, tokenDigest } from "@/lib/auth";
import { database } from "@/lib/database";
import { readStore } from "@/lib/store";

export const GET = secureRoute(async () => {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Connexion requise." },
      { status: 401 },
    );

  const db = database();
  const account = db
    .prepare(
      "SELECT id,email,name,role,disabled,password_set,space_scope FROM users WHERE id=?",
    )
    .get(user.id) as
    | {
        id: string;
        email: string;
        name: string;
        role: string;
        disabled: number;
        password_set: number;
        space_scope: string;
      }
    | undefined;
  if (!account)
    return NextResponse.json(
      { error: "Compte introuvable." },
      { status: 404 },
    );

  const data = await readStore();
  const email = user.email.trim().toLowerCase();
  const emailHash = tokenDigest(email);
  const sameNameCount = db
    .prepare("SELECT count(*) AS count FROM users WHERE lower(name)=lower(?)")
    .get(user.name) as { count: number };
  const allowedSpaces = data.spaces
    .filter((space) =>
      (space.allowedEmails ?? []).some(
        (allowed) => allowed.trim().toLowerCase() === email,
      ),
    )
    .map(({ id, name, slug, accessMode }) => ({ id, name, slug, accessMode }));
  const comments = (data.comments ?? [])
    .filter(
      (comment) =>
        comment.authorUserId === user.id ||
        (!comment.authorUserId && sameNameCount.count === 1 &&
          comment.author.trim().toLowerCase() === user.name.trim().toLowerCase()),
    )
    .map((comment) => ({
      ...comment,
      attribution: comment.authorUserId ? "account" : "legacy-name-match",
    }));
  const activity = db
    .prepare(
      "SELECT actor,action,target,created_at FROM activity WHERE lower(actor)=lower(?) OR target=? ORDER BY id DESC",
    )
    .all(user.email, user.id);
  const accountSessions = db
    .prepare("SELECT expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY expires_at")
    .all(user.id, Date.now());
  const accountLinks = db
    .prepare("SELECT purpose,created_at,expires_at FROM account_tokens WHERE user_id=? ORDER BY created_at DESC")
    .all(user.id);
  const loginRateLimit = db
    .prepare("SELECT count,resets_at FROM rate_limits WHERE bucket=? AND resets_at>? ")
    .get("login:" + email, Date.now());
  const portalSessions = db
    .prepare(
      "SELECT space_id,expires_at FROM portal_access_sessions WHERE email_hash=? AND expires_at>?",
    )
    .all(emailHash, Date.now());
  const mcpConnections = (
    db
      .prepare(
        "SELECT id,name,space_ids,created_at,expires_at,last_used_at,revoked_at FROM mcp_connections WHERE user_id=? ORDER BY created_at DESC",
      )
      .all(user.id) as {
      id: string;
      name: string;
      space_ids: string;
      created_at: number;
      expires_at: number;
      last_used_at: number | null;
      revoked_at: number | null;
    }[]
  ).map((connection) => ({
    id: connection.id,
    name: connection.name,
    spaceIds: JSON.parse(connection.space_ids) as string[],
    createdAt: new Date(connection.created_at).toISOString(),
    expiresAt: new Date(connection.expires_at).toISOString(),
    lastUsedAt: connection.last_used_at
      ? new Date(connection.last_used_at).toISOString()
      : null,
    revokedAt: connection.revoked_at
      ? new Date(connection.revoked_at).toISOString()
      : null,
  }));

  const response = NextResponse.json({
    generatedAt: new Date().toISOString(),
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      disabled: Boolean(account.disabled),
      passwordSet: Boolean(account.password_set),
      spaceScope: account.space_scope,
      spaceIds: user.spaceIds,
    },
    invitedPortalSpaces: allowedSpaces,
    activePortalSessions: portalSessions,
    activeAccountSessions: accountSessions,
    accountLinks,
    temporaryLoginRateLimit: loginRateLimit ?? null,
    comments,
    activity,
    mcpConnections,
    note: "Les modifications de documents partagés ne sont pas attribuées à un compte par cette version.",
  });
  response.headers.set(
    "Content-Disposition",
    'attachment; filename="documentalist-personal-data.json"',
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
});
