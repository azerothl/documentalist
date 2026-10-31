import { NextResponse } from "next/server";
import { createDocument, listDocuments } from "@/lib/store";
import type { DocumentKind, MarkdownFormat, TipTapDoc } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get("spaceId");
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId required" }, { status: 400 });
  }
  const documents = await listDocuments(spaceId);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    spaceId?: string;
    title?: string;
    parentId?: string | null;
    kind?: DocumentKind;
    content?: TipTapDoc;
    href?: string | null;
    locale?: string;
    markdownFormat?: MarkdownFormat | null;
  };
  if (!body.spaceId || !body.title?.trim()) {
    return NextResponse.json(
      { error: "spaceId and title required" },
      { status: 400 },
    );
  }
  const document = await createDocument({
    spaceId: body.spaceId,
    title: body.title.trim(),
    parentId: body.parentId,
    kind: body.kind,
    content: body.content,
    href: body.href,
    locale: body.locale,
    markdownFormat: body.markdownFormat,
  });
  return NextResponse.json({ document }, { status: 201 });
}
