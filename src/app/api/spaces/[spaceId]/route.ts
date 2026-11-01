import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
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
    const again = await getWorkspacePayload(bySlug.id);
    return NextResponse.json(again);
  }
  return NextResponse.json(payload);
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
