import { NextResponse } from "next/server";
import { addComment, listComments, updateComment } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }
  const comments = await listComments(documentId);
  return NextResponse.json({ comments });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    author?: string;
    body?: string;
  };
  if (!body.documentId || !body.body?.trim()) {
    return NextResponse.json(
      { error: "documentId and body required" },
      { status: 400 },
    );
  }
  const comment = await addComment({
    documentId: body.documentId,
    author: body.author ?? "You",
    body: body.body,
  });
  return NextResponse.json({ comment }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    resolved?: boolean;
    body?: string;
  };
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const comment = await updateComment(body.id, {
    resolved: body.resolved,
    body: body.body,
  });
  if (!comment) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ comment });
}
