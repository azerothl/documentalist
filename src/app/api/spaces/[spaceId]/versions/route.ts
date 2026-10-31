import { NextResponse } from "next/server";
import { createSpaceVersion, getSpace, listSpaces } from "@/lib/store";

type Params = { params: Promise<{ spaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { spaceId } = await params;
  const space = await getSpace(spaceId);
  if (!space) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const spaces = await listSpaces();
  const versions = spaces.filter(
    (s) => s.versionGroupId === space.versionGroupId,
  );
  return NextResponse.json({ versions });
}

export async function POST(request: Request, { params }: Params) {
  const { spaceId } = await params;
  const body = (await request.json()) as { label?: string };
  const space = await createSpaceVersion(spaceId, body.label ?? "v1.0");
  if (!space) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ space }, { status: 201 });
}
