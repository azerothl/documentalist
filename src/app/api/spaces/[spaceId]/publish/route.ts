import { NextResponse } from "next/server";
import { publishSpace } from "@/lib/store";

type Params = { params: Promise<{ spaceId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { spaceId } = await params;
  const space = await publishSpace(spaceId);
  if (!space) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ space });
}
