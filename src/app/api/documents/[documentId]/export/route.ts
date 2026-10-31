import { NextResponse } from "next/server";
import { tipTapToMarkdown } from "@/lib/markdown";
import { getDocument } from "@/lib/store";

type Params = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { documentId } = await params;
  const document = await getDocument(documentId);
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const markdown = tipTapToMarkdown(document.content);
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${document.slug}.md"`,
    },
  });
}
