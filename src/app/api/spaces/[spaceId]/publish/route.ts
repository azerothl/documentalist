import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { publishSpace } from "@/lib/store";
import { z } from "zod";

type Params = { params: Promise<{ spaceId: string }> };

async function handlePOST(request: Request, { params }: Params) {
  const { spaceId } = await params;
  const body = request.headers.get("content-type")?.includes("application/json")
    ? z
        .object({
          accessMode: z.enum(["public", "password", "magic_link"]).optional(),
          accessPassword: z.string().max(256).nullable().optional(),
        })
        .parse(await request.json())
    : {};
  const space = await publishSpace(spaceId, undefined, body);
  if (!space) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ space });
}

export const POST = secureRoute(handlePOST);
