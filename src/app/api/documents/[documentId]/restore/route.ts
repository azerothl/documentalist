import { NextResponse } from "next/server";
import { restoreRevision } from "@/lib/store";

type Params = { params: Promise<{ documentId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { documentId } = await params;
  const body = (await request.json()) as { revisionId?: string };
  if (!body.revisionId) {
    return NextResponse.json({ error: "revisionId required" }, { status: 400 });
  }
  const document = await restoreRevision(documentId, body.revisionId);
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ document });
}
