import { randomBytes } from "node:crypto";
import {
  canAccessSpace,
  tokenDigest,
  type User,
  type SpaceScope,
  type Role,
} from "./auth";
import { database } from "./database";

export type McpPrincipal = {
  connectionId: string;
  user: User;
  spaceIds: string[];
};

export function createMcpConnection(
  userId: string,
  name: string,
  spaceIds: string[],
  days: number,
) {
  const id = randomBytes(16).toString("hex");
  const accessKey = `doc_mcp_${randomBytes(32).toString("base64url")}`;
  database()
    .prepare(
      "INSERT INTO mcp_connections(id,user_id,name,key_hash,space_ids,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      id,
      userId,
      name,
      tokenDigest(accessKey),
      JSON.stringify([...new Set(spaceIds)]),
      Date.now(),
      Date.now() + days * 86400000,
    );
  return { id, accessKey };
}

export function authenticateMcp(accessKey: string): McpPrincipal | null {
  const db = database();
  const row = db
    .prepare(
      `SELECT c.id AS connection_id,c.space_ids,u.id,u.email,u.name,u.role,u.space_scope
    FROM mcp_connections c JOIN users u ON u.id=c.user_id
    WHERE c.key_hash=? AND c.revoked_at IS NULL AND c.expires_at>? AND u.disabled=0 AND u.password_set=1`,
    )
    .get(tokenDigest(accessKey), Date.now()) as
    | {
        connection_id: string;
        space_ids: string;
        id: string;
        email: string;
        name: string;
        role: Role;
        space_scope: SpaceScope;
      }
    | undefined;
  if (!row) return null;
  const grants = db
    .prepare("SELECT space_id FROM user_space_access WHERE user_id=?")
    .all(row.id) as { space_id: string }[];
  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    spaceScope: row.space_scope,
    spaceIds: grants.map((g) => g.space_id),
  };
  return {
    connectionId: row.connection_id,
    user,
    spaceIds: (JSON.parse(row.space_ids) as string[]).filter((id) =>
      canAccessSpace(user, id),
    ),
  };
}
