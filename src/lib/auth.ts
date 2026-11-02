import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database, audit, dataDirectory } from "./database";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Space } from "./types";

export type Role = "admin" | "editor" | "viewer";
export type User = { id: string; email: string; name: string; role: Role };
export const SESSION_COOKIE = "documentalist-session";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure:
    process.env.NODE_ENV === "production" &&
    process.env.DOCUMENTALIST_COOKIE_SECURE !== "false",
  path: "/",
};
export const tokenDigest = (s: string) =>
  createHash("sha256").update(s).digest("hex");

export function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}

export function verifyPassword(value: string, stored: string) {
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(value, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hasUsers() {
  return Boolean(database().prepare("SELECT 1 FROM users LIMIT 1").get());
}
export function setupToken() {
  if (process.env.DOCUMENTALIST_SETUP_TOKEN)
    return process.env.DOCUMENTALIST_SETUP_TOKEN;
  mkdirSync(dataDirectory, { recursive: true });
  const file = path.join(dataDirectory, "setup-token");
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(24).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return readFileSync(file, "utf8").trim();
}

export function createUser(
  input: { email: string; name: string; password: string; role: Role },
  first = false,
) {
  if (input.password.length < 12 || input.password.length > 256)
    throw new Error("Utilisez un mot de passe de 12 à 256 caractères.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw new Error("Adresse e-mail invalide.");
  const user: User = {
    id: randomBytes(16).toString("hex"),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim().slice(0, 100) || input.email,
    role: input.role,
  };
  const passwordHash = hashPassword(input.password);
  database().transaction(() => {
    if (first && hasUsers()) throw new Error("Le compte initial existe déjà.");
    database()
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,role) VALUES (?,?,?,?,?)",
      )
      .run(user.id, user.email, user.name, passwordHash, user.role);
  })();
  audit(user.email, "account.created", user.id);
  return user;
}

export function createInvitedUser(
  input: { email: string; name: string; role: Role },
  actor = "administrator",
) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw new Error("Adresse e-mail invalide.");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 100) || email;
  const db = database();
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
    throw new Error("Un compte existe déjà avec cette adresse e-mail.");
  const user: User = {
    id: randomBytes(16).toString("hex"),
    email,
    name,
    role: input.role,
  };
  // Keep the existing NOT NULL schema while ensuring the placeholder cannot
  // be used to authenticate. password_set gates all login attempts.
  const passwordHash = hashPassword(randomBytes(48).toString("hex"));
  db.prepare(
    "INSERT INTO users(id,email,name,password_hash,role,password_set) VALUES (?,?,?,?,?,0)",
  ).run(user.id, user.email, user.name, passwordHash, user.role);
  audit(actor, "account.invited", user.id);
  return user;
}

export type AccountTokenPurpose = "setup" | "reset";

export function createAccountToken(
  userId: string,
  purpose: AccountTokenPurpose,
) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  database().transaction(() => {
    database()
      .prepare("DELETE FROM account_tokens WHERE expires_at<?")
      .run(now);
    database()
      .prepare("DELETE FROM account_tokens WHERE user_id=?")
      .run(userId);
    database()
      .prepare(
        "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at,created_at) VALUES (?,?,?,?,?)",
      )
      .run(
        tokenDigest(token),
        userId,
        purpose,
        now + (purpose === "setup" ? 24 : 1) * 60 * 60 * 1000,
        now,
      );
  })();
  return token;
}

export function setPasswordFromAccountToken(token: string, password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error("Utilisez un mot de passe de 12 à 256 caractères.");
  const db = database();
  const tokenHash = tokenDigest(token);
  return db.transaction(() => {
    const row = db
      .prepare(
        `SELECT t.user_id,u.email,u.disabled FROM account_tokens t
         JOIN users u ON u.id=t.user_id
         WHERE t.token_hash=? AND t.expires_at>?`,
      )
      .get(tokenHash, Date.now()) as
      { user_id: string; email: string; disabled: number } | undefined;
    if (!row || row.disabled)
      throw new Error(
        "Ce lien est invalide ou a expiré. Demandez-en un nouveau.",
      );
    db.prepare(
      "UPDATE users SET password_hash=?,password_set=1 WHERE id=?",
    ).run(hashPassword(password), row.user_id);
    db.prepare("DELETE FROM account_tokens WHERE user_id=?").run(row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
    audit(row.email, "account.password_set", row.user_id);
    return row.email;
  })();
}

export function login(email: string, password: string) {
  const row = database()
    .prepare(
      "SELECT * FROM users WHERE email=? AND disabled=0 AND password_set=1",
    )
    .get(email.trim().toLowerCase()) as
    (User & { password_hash: string }) | undefined;
  // Compute a hash even for an unknown account to avoid the obvious timing gap.
  const hash =
    row?.password_hash ??
    "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
  if (!verifyPassword(password, hash) || !row) return null;
  const token = randomBytes(32).toString("hex");
  database()
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(tokenDigest(token), row.id, Date.now() + 8 * 60 * 60 * 1000);
  database()
    .prepare("DELETE FROM sessions WHERE expires_at < ?")
    .run(Date.now());
  audit(row.email, "login", row.id);
  return token;
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (
    (database()
      .prepare(
        `SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON s.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`,
      )
      .get(tokenDigest(token), Date.now()) as User | undefined) ?? null
  );
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect(hasUsers() ? "/login" : "/setup");
  return user;
}

export function logout(token: string) {
  database()
    .prepare("DELETE FROM sessions WHERE token_hash=?")
    .run(tokenDigest(token));
}

export function portalCookieName(id: string) {
  return `portal-${id}`;
}
export function portalTicket(
  id: string,
  passwordHash: string,
  expires: number,
) {
  return `${expires}.${createHmac("sha256", passwordHash).update(`${id}:${expires}`).digest("hex")}`;
}

export function createPortalMagicToken(spaceId: string, email: string) {
  const token = randomBytes(32).toString("base64url");
  const db = database();
  const normalizedEmail = email.trim().toLowerCase();
  db.transaction(() => {
    db.prepare("DELETE FROM portal_magic_tokens WHERE expires_at<?").run(
      Date.now(),
    );
    db.prepare(
      "DELETE FROM portal_magic_tokens WHERE space_id=? AND email_hash=?",
    ).run(spaceId, tokenDigest(normalizedEmail));
    db.prepare(
      "INSERT INTO portal_magic_tokens(token_hash,space_id,email_hash,expires_at) VALUES (?,?,?,?)",
    ).run(
      tokenDigest(token),
      spaceId,
      tokenDigest(normalizedEmail),
      Date.now() + 24 * 60 * 60 * 1000,
    );
  })();
  return token;
}

export function consumePortalMagicToken(token: string) {
  const db = database();
  const tokenHash = tokenDigest(token);
  return db.transaction(() => {
    const row = db
      .prepare(
        "SELECT space_id,email_hash FROM portal_magic_tokens WHERE token_hash=? AND expires_at>?",
      )
      .get(tokenHash, Date.now()) as
      { space_id: string; email_hash: string } | undefined;
    if (!row) return null;
    db.prepare("DELETE FROM portal_magic_tokens WHERE token_hash=?").run(
      tokenHash,
    );
    const sessionToken = randomBytes(32).toString("base64url");
    db.prepare(
      "INSERT INTO portal_access_sessions(token_hash,space_id,email_hash,expires_at) VALUES (?,?,?,?)",
    ).run(
      tokenDigest(sessionToken),
      row.space_id,
      row.email_hash,
      Date.now() + 8 * 60 * 60 * 1000,
    );
    db.prepare("DELETE FROM portal_access_sessions WHERE expires_at<?").run(
      Date.now(),
    );
    return { ...row, sessionToken };
  })();
}

export function getPortalMagicToken(token: string) {
  return database()
    .prepare(
      "SELECT space_id,email_hash FROM portal_magic_tokens WHERE token_hash=? AND expires_at>?",
    )
    .get(tokenDigest(token), Date.now()) as
    { space_id: string; email_hash: string } | undefined;
}

export function revokePortalMagicAccess(spaceId: string, email: string) {
  const db = database();
  const normalizedEmail = email.trim().toLowerCase();
  db.transaction(() => {
    db.prepare(
      "DELETE FROM portal_magic_tokens WHERE space_id=? AND email_hash=?",
    ).run(spaceId, tokenDigest(normalizedEmail));
    db.prepare(
      "DELETE FROM portal_access_sessions WHERE space_id=? AND email_hash=?",
    ).run(spaceId, tokenDigest(normalizedEmail));
  })();
}

export async function portalAllowed(
  space: Pick<Space, "id" | "accessMode" | "accessPassword" | "allowedEmails">,
) {
  const mode = space.accessMode;
  if (mode === "public") return true;
  const ticket = (await cookies()).get(portalCookieName(space.id))?.value;
  if (!ticket) return false;
  if (mode === "magic_link") {
    const session = database()
      .prepare(
        "SELECT email_hash FROM portal_access_sessions WHERE token_hash=? AND space_id=? AND expires_at>?",
      )
      .get(tokenDigest(ticket), space.id, Date.now()) as
      { email_hash: string } | undefined;
    return Boolean(
      session &&
      (space.allowedEmails ?? []).some(
        (email) => tokenDigest(email.toLowerCase()) === session.email_hash,
      ),
    );
  }
  const hash = space.accessPassword;
  if (!hash) return false;
  const expires = Number(ticket.split(".")[0]);
  if (
    !Number.isFinite(expires) ||
    expires < Date.now() ||
    expires > Date.now() + 8 * 60 * 60 * 1000
  )
    return false;
  const expected = Buffer.from(portalTicket(space.id, hash, expires));
  const actual = Buffer.from(ticket);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
