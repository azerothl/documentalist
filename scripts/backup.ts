import { mkdir } from "node:fs/promises";
import path from "node:path";
import { database, dataDirectory } from "../src/lib/database";

async function main() {
  const directory = path.join(dataDirectory, "backups");
  await mkdir(directory, { recursive: true });
  const file = path.join(
    directory,
    `documentalist-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
  );
  const db = database();
  await db.backup(file);
  db.close();
  console.log(`Sauvegarde créée : ${file}`);
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Échec de la sauvegarde",
  );
  process.exitCode = 1;
});
