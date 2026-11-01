import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import {
  deleteDocument,
  getDocument,
  listRevisions,
  saveDocumentContent,
  updateDocument,
} from "@/lib/store";

type Params = { params: Promise<{ documentId: string }> };

async function handleGET(_request: Request, { params }: Params) {
  const { documentId } = await params;
  const document = await getDocument(documentId);
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const revisions = await listRevisions(documentId);
  return NextResponse.json({ document, revisions });
}

async function handlePATCH(request: Request, { params }: Params) {
  const { documentId } = await params;
  const body = await request.json();

  if (body.content !== undefined) {
    const document = await saveDocumentContent(
      documentId,
      body.content,
      body.title,
      body.expectedUpdatedAt,
    );
    if (!document) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ document });
  }

  const document = await updateDocument(documentId, body, {
    expectedUpdatedAt: body.expectedUpdatedAt,
  });
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ document });
}

async function handleDELETE(_request: Request, { params }: Params) {
  const { documentId } = await params;
  const ok = await deleteDocument(documentId);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = secureRoute(handleGET);

export const PATCH = secureRoute(handlePATCH);

export const DELETE = secureRoute(handleDELETE);
