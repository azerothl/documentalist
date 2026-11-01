import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { database } from "@/lib/database";
import { createUser, hashPassword } from "@/lib/auth";
const role = z.enum(["admin", "editor", "viewer"]);
export const GET = secureRoute(
  async () =>
    NextResponse.json({
      users: database()
        .prepare("SELECT id,email,name,role,disabled FROM users ORDER BY name")
        .all(),
      activity: database()
        .prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 100")
        .all(),
      backups: database()
        .prepare(
          "SELECT revision,created_at FROM state_backups ORDER BY revision DESC",
        )
        .all(),
    }),
  { admin: true },
);
export const POST = secureRoute(
  async (request) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
        password: z.string().min(12).max(256),
        role,
      })
      .parse(await request.json());
    return NextResponse.json({ user: createUser(body) }, { status: 201 });
  },
  { admin: true },
);
export const PATCH = secureRoute(
  async (request) => {
    const body = z
      .object({
        id: z.string(),
        role: role.optional(),
        disabled: z.boolean().optional(),
        password: z.string().min(12).max(256).optional(),
      })
      .parse(await request.json());
    const db = database();
    db.transaction(() => {
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(body.id) as
        { role: string; disabled: number } | undefined;
      if (!user) throw new Error("Compte introuvable.");
      if (
        user.role === "admin" &&
        !user.disabled &&
        (body.disabled || (body.role && body.role !== "admin")) &&
        (
          db
            .prepare(
              "SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0",
            )
            .get() as { n: number }
        ).n <= 1
      )
        throw new Error("Conservez au moins un administrateur actif.");
      db.prepare(
        "UPDATE users SET role=coalesce(?,role),disabled=coalesce(?,disabled),password_hash=coalesce(?,password_hash) WHERE id=?",
      ).run(
        body.role ?? null,
        body.disabled === undefined ? null : Number(body.disabled),
        body.password ? hashPassword(body.password) : null,
        body.id,
      );
      if (body.password || body.disabled)
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(body.id);
    })();
    return NextResponse.json({ ok: true });
  },
  { admin: true },
);
