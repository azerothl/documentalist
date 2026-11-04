import { mkdir, readdir, lstat, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { database, dataDirectory } from "../src/lib/database";
import { getRetentionPolicy } from "../src/lib/privacy";

async function pruneOldBackups(directory: string, days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const name of await readdir(directory)) {
    if (!name.startsWith("documentalist-") || !name.endsWith(".sqlite"))
      continue;
    const file = path.join(directory, name);
    const info = await lstat(file);
    if (info.isFile() && info.mtimeMs < cutoff) await unlink(file);
  }
}

async function main() {
  const directory = path.join(dataDirectory, "backups");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const file = path.join(
    directory,
    `documentalist-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
  );
  const db = database();
  try {
    await db.backup(file);
    await chmod(file, 0o600);
  } finally {
    db.close();
    await pruneOldBackups(directory, getRetentionPolicy().backupDays);
  }
  console.log(`Sauvegarde créée : ${file}`);
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Échec de la sauvegarde",
  );
  process.exitCode = 1;
});
