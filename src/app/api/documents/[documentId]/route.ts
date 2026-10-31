import { NextResponse } from "next/server";
import {
  deleteDocument,
  getDocument,
  listRevisions,
  saveDocumentContent,
  updateDocument,
} from "@/lib/store";

type Params = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { documentId } = await params;
  const document = await getDocument(documentId);
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const revisions = await listRevisions(documentId);
  return NextResponse.json({ document, revisions });
}

export async function PATCH(request: Request, { params }: Params) {
  const { documentId } = await params;
  const body = await request.json();

  if (body.content !== undefined) {
    const document = await saveDocumentContent(
      documentId,
      body.content,
      body.title,
    );
    if (!document) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ document });
  }

  const document = await updateDocument(documentId, body);
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ document });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { documentId } = await params;
  const ok = await deleteDocument(documentId);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
