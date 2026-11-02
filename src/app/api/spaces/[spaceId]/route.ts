import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { canAccessSpace, currentUser } from "@/lib/auth";
import { getSpace, getWorkspacePayload, updateSpace } from "@/lib/store";

type Params = { params: Promise<{ spaceId: string }> };

async function handleGET(_request: Request, { params }: Params) {
  const { spaceId } = await params;
  const payload = await getWorkspacePayload(spaceId);
  if (!payload) {
    const bySlug = await getSpace(spaceId);
    if (!bySlug) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const user = (await currentUser())!;
    if (!canAccessSpace(user, bySlug.id))
      return NextResponse.json({ error: "not found" }, { status: 404 });
    const again = await getWorkspacePayload(bySlug.id);
    if (!again)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(filterWorkspacePayload(again, user));
  }
  const user = (await currentUser())!;
  return NextResponse.json(filterWorkspacePayload(payload, user));
}

function filterWorkspacePayload<T extends {
  spaces: { id: string; versionGroupId: string }[];
  versionSpaces: { id: string }[];
  integrations: unknown[];
}>(payload: T, user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const spaces = payload.spaces.filter((space) => canAccessSpace(user, space.id));
  const allowed = new Set(spaces.map((space) => space.id));
  return {
    ...payload,
    spaces,
    versionSpaces: payload.versionSpaces.filter((space) => allowed.has(space.id)),
    integrations: user.role === "admin" || user.spaceScope === "all"
      ? payload.integrations
      : [],
  };
}

async function handlePATCH(request: Request, { params }: Params) {
  const { spaceId } = await params;
  const body = await request.json();
  const space = await updateSpace(spaceId, body);
  if (!space) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ space });
}

export const GET = secureRoute(handleGET);

export const PATCH = secureRoute(handlePATCH);
