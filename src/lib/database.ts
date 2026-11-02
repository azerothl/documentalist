import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export const dataDirectory =
  process.env.DOCUMENTALIST_DATA_DIR || path.join(process.cwd(), "data");
const globals = globalThis as typeof globalThis & {
  documentalistDb?: Database.Database;
  documentalistKey?: Buffer;
};

function key() {
  if (globals.documentalistKey) return globals.documentalistKey;
  mkdirSync(dataDirectory, { recursive: true });
  const file = path.join(dataDirectory, "encryption.key");
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(32), { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const value = process.env.DOCUMENTALIST_ENCRYPTION_KEY
    ? Buffer.from(process.env.DOCUMENTALIST_ENCRYPTION_KEY, "base64")
    : readFileSync(file);
  if (value.length !== 32)
    throw new Error("La clé de chiffrement doit contenir 32 octets.");
  globals.documentalistKey = value;
  return value;
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decrypt(text: string): string {
  const [iv, tag, body] = text.split(".").map((v) => Buffer.from(v, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8");
}

export function database() {
  if (globals.documentalistDb) return globals.documentalistDb;
  mkdirSync(dataDirectory, { recursive: true });
  const db = new Database(path.join(dataDirectory, "documentalist.sqlite"));
  if (Number(db.pragma("user_version", { simple: true })) > 3) {
    db.close();
    throw new Error(
      "Version de base de données plus récente que l’application.",
    );
  }
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS state_backups (revision INTEGER PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')), disabled INTEGER NOT NULL DEFAULT 0, password_set INTEGER NOT NULL DEFAULT 1, space_scope TEXT NOT NULL DEFAULT 'all' CHECK(space_scope IN ('all','selected')));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('setup','reset')), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_magic_tokens (token_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL, email_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_access_sessions (token_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL, email_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
  `);
  const userColumns = db.pragma("table_info(users)") as { name: string }[];
  if (!userColumns.some((column) => column.name === "password_set"))
    db.exec(
      "ALTER TABLE users ADD COLUMN password_set INTEGER NOT NULL DEFAULT 1",
    );
  if (!userColumns.some((column) => column.name === "space_scope"))
    db.exec(
      "ALTER TABLE users ADD COLUMN space_scope TEXT NOT NULL DEFAULT 'all' CHECK(space_scope IN ('all','selected'))",
    );
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_space_access (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, space_id TEXT NOT NULL, PRIMARY KEY(user_id,space_id));
    CREATE INDEX IF NOT EXISTS user_space_access_space ON user_space_access(space_id);
    CREATE INDEX IF NOT EXISTS account_tokens_user ON account_tokens(user_id);
    CREATE INDEX IF NOT EXISTS portal_magic_space_email ON portal_magic_tokens(space_id,email_hash);
    CREATE INDEX IF NOT EXISTS portal_sessions_space_email ON portal_access_sessions(space_id,email_hash);
    PRAGMA user_version = 3;
  `);
  globals.documentalistDb = db;
  return db;
}

export function audit(actor: string, action: string, target: string) {
  const db = database();
  db.prepare("INSERT INTO activity(actor,action,target) VALUES (?,?,?)").run(
    actor,
    action,
    target,
  );
  db.prepare(
    "DELETE FROM activity WHERE id < (SELECT max(id)-5000 FROM activity)",
  ).run();
}

export function rateLimit(bucket: string, limit: number, windowMs = 60_000) {
  const db = database();
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO rate_limits(bucket,count,resets_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,
    resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END RETURNING count`,
    )
    .get(bucket, now + windowMs, now, now) as { count: number };
  db.prepare("DELETE FROM rate_limits WHERE resets_at < ?").run(now - windowMs);
  return result.count <= limit;
}
