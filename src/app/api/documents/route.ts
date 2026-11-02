import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { createDocument, listDocuments } from "@/lib/store";
import type {
  DocSection,
  DocumentKind,
  MarkdownFormat,
  TipTapDoc,
} from "@/lib/types";
import { isSection } from "@/lib/sections";

async function handleGET(request: Request) {
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get("spaceId");
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId required" }, { status: 400 });
  }
  const documents = await listDocuments(spaceId);
  return NextResponse.json({ documents });
}

async function handlePOST(request: Request) {
  const body = (await request.json()) as {
    spaceId?: string;
    title?: string;
    parentId?: string | null;
    kind?: DocumentKind;
    content?: TipTapDoc;
    href?: string | null;
    locale?: string;
    markdownFormat?: MarkdownFormat | null;
    section?: DocSection;
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
    section: isSection(body.section) ? body.section : undefined,
  });
  return NextResponse.json({ document }, { status: 201 });
}

export const GET = secureRoute(handleGET);

export const POST = secureRoute(handlePOST);
