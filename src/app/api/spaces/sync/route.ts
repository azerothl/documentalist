import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/api";
import { syncSpaceImport } from "@/lib/store";

async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    spaceId?: string;
    force?: boolean;
  };
  if (!body.spaceId?.trim()) {
    return NextResponse.json({ error: "spaceId required" }, { status: 400 });
  }
  try {
    const result = await syncSpaceImport(body.spaceId.trim(), {
      force: body.force !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync échouée" },
      { status: 400 },
    );
  }
}

export const POST = secureRoute(handlePOST);
