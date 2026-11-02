import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { database } from "@/lib/database";
import { canAccessSpace, type User } from "@/lib/auth";
import { createMcpConnection } from "@/lib/mcp-access";
import { listSpaces } from "@/lib/store";

export const GET = secureRoute(
  async () => {
    const connections = database()
      .prepare(
        `SELECT c.id,c.name,c.user_id,c.space_ids,c.created_at,c.expires_at,c.last_used_at,c.revoked_at,u.email
    FROM mcp_connections c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC`,
      )
      .all() as { space_ids: string; expires_at: number }[];
    return NextResponse.json({
      connections: connections.map(({ space_ids, ...row }) => ({
        ...row,
        spaceIds: JSON.parse(space_ids),
        expired: Number(row.expires_at) <= Date.now(),
      })),
    });
  },
  { admin: true },
);

export const POST = secureRoute(
  async (request) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        userId: z.string().min(1),
        spaceIds: z.array(z.string().min(1)).min(1).max(500),
        days: z.number().int().min(1).max(365).default(90),
      })
      .parse(await request.json());
    const db = database();
    const row = db
      .prepare(
        "SELECT id,email,name,role,space_scope FROM users WHERE id=? AND disabled=0 AND password_set=1",
      )
      .get(body.userId) as
      | (Omit<User, "spaceScope" | "spaceIds"> & {
          space_scope: User["spaceScope"];
        })
      | undefined;
    if (!row)
      return NextResponse.json(
        {
          error: "Choisissez un compte actif dont le mot de passe est défini.",
        },
        { status: 400 },
      );
    const grants = db
      .prepare("SELECT space_id FROM user_space_access WHERE user_id=?")
      .all(row.id) as { space_id: string }[];
    const user: User = {
      ...row,
      spaceScope: row.space_scope,
      spaceIds: grants.map((g) => g.space_id),
    };
    const spaces = await listSpaces();
    if (
      body.spaceIds.some(
        (id) => !spaces.some((s) => s.id === id) || !canAccessSpace(user, id),
      )
    )
      return NextResponse.json(
        { error: "Un espace est absent ou inaccessible à ce compte." },
        { status: 400 },
      );
    return NextResponse.json(
      createMcpConnection(body.userId, body.name, body.spaceIds, body.days),
      { status: 201 },
    );
  },
  { admin: true },
);

export const DELETE = secureRoute(
  async (request) => {
    const { id } = z
      .object({ id: z.string().min(1) })
      .parse(await request.json());
    database()
      .prepare(
        "UPDATE mcp_connections SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
      )
      .run(Date.now(), id);
    return NextResponse.json({ ok: true });
  },
  { admin: true },
);
