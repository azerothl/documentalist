import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { database } from "@/lib/database";
import {
  createAccountToken,
  createInvitedUser,
  currentUser,
  createUser,
  hashPassword,
} from "@/lib/auth";
import { emailIsConfigured, sendAccountLink } from "@/lib/email";
import { listSpaces } from "@/lib/store";
import type { SpaceScope } from "@/lib/auth";
const role = z.enum(["admin", "editor", "viewer"]);
const spaceScope = z.enum(["all", "selected"]);
export const GET = secureRoute(
  async () => {
    const db = database();
    const users = db
      .prepare(
        "SELECT id,email,name,role,disabled,password_set,space_scope FROM users ORDER BY name",
      )
      .all() as {
      id: string;
      space_scope: SpaceScope;
      [key: string]: unknown;
    }[];
    const grants = db
      .prepare("SELECT user_id,space_id FROM user_space_access ORDER BY space_id")
      .all() as { user_id: string; space_id: string }[];
    const idsByUser = new Map<string, string[]>();
    for (const grant of grants) {
      const ids = idsByUser.get(grant.user_id) ?? [];
      ids.push(grant.space_id);
      idsByUser.set(grant.user_id, ids);
    }
    return NextResponse.json({
      users: users.map(({ space_scope, ...user }) => ({
        ...user,
        spaceScope: space_scope,
        spaceIds: idsByUser.get(String(user.id)) ?? [],
      })),
      spaces: (await listSpaces()).map(({ id, name }) => ({ id, name })),
      activity: db
        .prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 100")
        .all(),
      backups: db
        .prepare(
          "SELECT revision,created_at FROM state_backups ORDER BY revision DESC",
        )
        .all(),
    });
  },
  { admin: true },
);
export const POST = secureRoute(
  async (request) => {
    const body = z
      .object({
        email: z.string().email().max(254),
        name: z.string().min(1).max(100),
        password: z.string().min(12).max(256).optional(),
        role,
        spaceScope: spaceScope.optional(),
        spaceIds: z.array(z.string().min(1)).max(500).optional(),
      })
      .parse(await request.json());
    const spaces = await listSpaces();
    const assignedIds = [...new Set(body.spaceIds ?? [])];
    if (body.role !== "admin" && body.spaceScope === "selected") {
      if (assignedIds.length === 0)
        return NextResponse.json(
          { error: "Sélectionnez au moins un espace pour ce compte." },
          { status: 400 },
        );
      if (assignedIds.some((id) => !spaces.some((space) => space.id === id)))
        return NextResponse.json(
          { error: "Un des espaces sélectionnés est introuvable." },
          { status: 400 },
        );
    }
    // Keep the authenticated API compatible with older administrative clients.
    // The team UI omits password and always creates an emailed invitation.
    if (body.password)
      return NextResponse.json(
        {
          user: createUser({
            email: body.email,
            name: body.name,
            password: body.password,
            role: body.role,
            spaceScope: body.spaceScope,
            spaceIds: assignedIds,
          }),
        },
        { status: 201 },
      );
    if (!emailIsConfigured())
      return NextResponse.json(
        {
          error:
            "Configurez l’envoi SMTP avant d’inviter un compte (DOCUMENTALIST_SMTP_URL et DOCUMENTALIST_EMAIL_FROM).",
        },
        { status: 503 },
      );
    const actor = await currentUser();
    const user = createInvitedUser(body, actor?.email);
    const token = createAccountToken(user.id, "setup");
    await sendAccountLink({ ...user, token, purpose: "setup" });
    return NextResponse.json({ user }, { status: 201 });
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
        spaceScope: spaceScope.optional(),
        spaceIds: z.array(z.string().min(1)).max(500).optional(),
      })
      .parse(await request.json());
    const db = database();
    const spaces = await listSpaces();
    db.transaction(() => {
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(body.id) as
        | {
            role: string;
            disabled: number;
            password_set: number;
            space_scope: SpaceScope;
          }
        | undefined;
      if (!user) throw new Error("Compte introuvable.");
      if (
        user.role === "admin" &&
        user.password_set &&
        !user.disabled &&
        (body.disabled || (body.role && body.role !== "admin")) &&
        (
          db
            .prepare(
              "SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0 AND password_set=1",
            )
            .get() as { n: number }
        ).n <= 1
      )
        throw new Error("Conservez au moins un administrateur actif.");
      const nextRole = body.role ?? user.role;
      const nextScope =
        nextRole === "admin" ? "all" : (body.spaceScope ?? user.space_scope);
      if (body.spaceIds?.some((id) => !spaces.some((space) => space.id === id)))
        throw new Error("Un des espaces sélectionnés est introuvable.");
      if (
        nextScope === "selected" &&
        (body.spaceIds ??
          (db
            .prepare("SELECT space_id FROM user_space_access WHERE user_id=?")
            .all(body.id) as { space_id: string }[]).map((row) => row.space_id)
        ).length === 0
      )
        throw new Error("Sélectionnez au moins un espace pour ce compte.");
      db.prepare(
        "UPDATE users SET role=coalesce(?,role),disabled=coalesce(?,disabled),password_hash=coalesce(?,password_hash),password_set=CASE WHEN ? IS NULL THEN password_set ELSE 1 END,space_scope=? WHERE id=?",
      ).run(
        body.role ?? null,
        body.disabled === undefined ? null : Number(body.disabled),
        body.password ? hashPassword(body.password) : null,
        body.password ? 1 : null,
        nextScope,
        body.id,
      );
      if (nextScope === "all") {
        db.prepare("DELETE FROM user_space_access WHERE user_id=?").run(body.id);
      } else if (body.spaceIds) {
        db.prepare("DELETE FROM user_space_access WHERE user_id=?").run(body.id);
        const grant = db.prepare(
          "INSERT INTO user_space_access(user_id,space_id) VALUES (?,?)",
        );
        for (const spaceId of [...new Set(body.spaceIds)])
          grant.run(body.id, spaceId);
      }
      if (body.password || body.disabled) {
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(body.id);
        db.prepare("DELETE FROM account_tokens WHERE user_id=?").run(body.id);
      }
    })();
    return NextResponse.json({ ok: true });
  },
  { admin: true },
);
