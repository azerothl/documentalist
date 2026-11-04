import Database from "better-sqlite3";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  readdirSync,
  lstatSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { getRetentionPolicy } from "./privacy";

export const dataDirectory =
  process.env.DOCUMENTALIST_DATA_DIR || path.join(process.cwd(), "data");
const globals = globalThis as typeof globalThis & {
  documentalistDb?: Database.Database;
  documentalistKey?: Buffer;
  documentalistRetentionCleanupAt?: number;
};

function retentionCutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

function pruneLocalBackups(days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const directory = path.join(dataDirectory, "backups");
  if (existsSync(directory)) {
    for (const name of readdirSync(directory)) {
      if (!name.startsWith("documentalist-") || !name.endsWith(".sqlite"))
        continue;
      const file = path.join(directory, name);
      const info = lstatSync(file);
      if (info.isFile() && info.mtimeMs < cutoff) unlinkSync(file);
    }
  }
}

function pruneExpiredAndRetainedData(db: Database.Database) {
  const now = Date.now();
  if (
    globals.documentalistRetentionCleanupAt &&
    now - globals.documentalistRetentionCleanupAt < 60 * 60 * 1000
  )
    return;
  const retention = getRetentionPolicy();
  db.transaction(() => {
    db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now);
    db.prepare("DELETE FROM account_tokens WHERE expires_at<?").run(now);
    db.prepare("DELETE FROM portal_magic_tokens WHERE expires_at<?").run(now);
    db.prepare("DELETE FROM portal_access_sessions WHERE expires_at<?").run(now);
    db.prepare("DELETE FROM mcp_connections WHERE expires_at<? OR revoked_at IS NOT NULL").run(now);
    db.prepare("DELETE FROM rate_limits WHERE resets_at<?").run(now);
    db.prepare("DELETE FROM activity WHERE created_at<?").run(
      retentionCutoff(retention.activityDays),
    );
    db.prepare("DELETE FROM state_backups WHERE created_at<?").run(
      retentionCutoff(retention.snapshotDays),
    );
  })();
  pruneLocalBackups(retention.backupDays);
  const legacyBackup = path.join(dataDirectory, "legacy-backup.enc");
  if (
    existsSync(legacyBackup) &&
    statSync(legacyBackup).mtimeMs <
      Date.now() - retention.snapshotDays * 24 * 60 * 60 * 1000
  )
    unlinkSync(legacyBackup);
  globals.documentalistRetentionCleanupAt = now;
}

function key() {
  if (globals.documentalistKey) return globals.documentalistKey;
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  chmodSync(dataDirectory, 0o700);
  const file = path.join(dataDirectory, "encryption.key");
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(32), { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  chmodSync(file, 0o600);
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
  if (globals.documentalistDb) {
    pruneExpiredAndRetainedData(globals.documentalistDb);
    return globals.documentalistDb;
  }
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  chmodSync(dataDirectory, 0o700);
  const file = path.join(dataDirectory, "documentalist.sqlite");
  const previousUmask = process.umask(0o077);
  let db: Database.Database;
  try {
    db = new Database(file);
  } finally {
    process.umask(previousUmask);
  }
  chmodSync(file, 0o600);
  if (Number(db.pragma("user_version", { simple: true })) > 4) {
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
    CREATE TABLE IF NOT EXISTS mcp_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL, space_ids TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER);
    CREATE INDEX IF NOT EXISTS user_space_access_space ON user_space_access(space_id);
    CREATE INDEX IF NOT EXISTS account_tokens_user ON account_tokens(user_id);
    CREATE INDEX IF NOT EXISTS portal_magic_space_email ON portal_magic_tokens(space_id,email_hash);
    CREATE INDEX IF NOT EXISTS portal_sessions_space_email ON portal_access_sessions(space_id,email_hash);
    PRAGMA user_version = 4;
  `);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = file + suffix;
    if (existsSync(sidecar)) chmodSync(sidecar, 0o600);
  }
  globals.documentalistDb = db;
  pruneExpiredAndRetainedData(db);
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
