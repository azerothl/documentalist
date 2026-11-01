import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { reorderDocuments } from "@/lib/store";

async function handlePOST(request: Request) {
  const body = (await request.json()) as {
    spaceId?: string;
    orderedIds?: string[];
    parentId?: string | null;
  };
  if (!body.spaceId || !Array.isArray(body.orderedIds)) {
    return NextResponse.json(
      { error: "spaceId and orderedIds required" },
      { status: 400 },
    );
  }
  const documents = await reorderDocuments(
    body.spaceId,
    body.orderedIds,
    body.parentId ?? null,
  );
  return NextResponse.json({ documents });
}

export const POST = secureRoute(handlePOST);
