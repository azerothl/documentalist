import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { database, decrypt, encrypt } from "@/lib/database";
import { validateDocumentTree } from "@/lib/validation";
import { migrateStore } from "@/lib/migrate";
import type { StoreData } from "@/lib/types";
export const GET = secureRoute(
  async () =>
    new Response(new Uint8Array(database().serialize()), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="documentalist-${new Date().toISOString().slice(0, 10)}.sqlite"`,
      },
    }),
  { admin: true },
);
export const POST = secureRoute(
  async (request) => {
    const { revision } = z
      .object({ revision: z.number().int().min(0) })
      .parse(await request.json());
    const db = database();
    db.transaction(() => {
      const backup = db
        .prepare("SELECT payload FROM state_backups WHERE revision=?")
        .get(revision) as { payload: string } | undefined;
      if (!backup) throw new Error("Sauvegarde introuvable.");
      const data = migrateStore(
        JSON.parse(decrypt(backup.payload)) as StoreData,
      );
      validateDocumentTree(data.documents, data.spaces);
      db.prepare(
        "INSERT OR IGNORE INTO state_backups(revision,payload) SELECT revision,payload FROM state WHERE id=1",
      ).run();
      db.prepare(
        "UPDATE state SET revision=revision+1,payload=? WHERE id=1",
      ).run(encrypt(JSON.stringify(data)));
      db.prepare(
        "DELETE FROM state_backups WHERE revision < (SELECT revision-20 FROM state WHERE id=1)",
      ).run();
    })();
    return NextResponse.json({ ok: true });
  },
  { admin: true },
);
