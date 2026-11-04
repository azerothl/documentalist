import { currentUser } from "@/lib/auth";
import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { addComment, listComments, updateComment } from "@/lib/store";

async function handleGET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }
  const comments = await listComments(documentId);
  return NextResponse.json({ comments });
}

async function handlePOST(request: Request) {
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
  const user = (await currentUser())!;
  const comment = await addComment({
    documentId: body.documentId,
    author: user.name,
    authorUserId: user.id,
    body: body.body,
  });
  return NextResponse.json({ comment }, { status: 201 });
}

async function handlePATCH(request: Request) {
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

export const GET = secureRoute(handleGET);

export const POST = secureRoute(handlePOST);

export const PATCH = secureRoute(handlePATCH);
