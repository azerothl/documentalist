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
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

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

export function login(email: string, password: string) {
  const row = database()
    .prepare("SELECT * FROM users WHERE email=? AND disabled=0")
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
    .run(digest(token), row.id, Date.now() + 8 * 60 * 60 * 1000);
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
      .get(digest(token), Date.now()) as User | undefined) ?? null
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
    .run(digest(token));
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
export async function portalAllowed(id: string, hash: string | null) {
  if (!hash) return true;
  const ticket = (await cookies()).get(portalCookieName(id))?.value;
  if (!ticket) return false;
  const expires = Number(ticket.split(".")[0]);
  if (
    !Number.isFinite(expires) ||
    expires < Date.now() ||
    expires > Date.now() + 8 * 60 * 60 * 1000
  )
    return false;
  const expected = Buffer.from(portalTicket(id, hash, expires));
  const actual = Buffer.from(ticket);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
