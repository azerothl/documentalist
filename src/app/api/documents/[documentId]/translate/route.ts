import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { createTranslation } from "@/lib/store";

type Params = { params: Promise<{ documentId: string }> };

async function handlePOST(request: Request, { params }: Params) {
  const { documentId } = await params;
  const body = (await request.json()) as { locale?: string };
  if (!body.locale?.trim()) {
    return NextResponse.json({ error: "locale required" }, { status: 400 });
  }
  const document = await createTranslation(documentId, body.locale.trim());
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ document }, { status: 201 });
}

export const POST = secureRoute(handlePOST);
