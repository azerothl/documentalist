import { NextResponse } from "next/server";
import { parseMarkdown, repairTipTapDoc } from "@/lib/markdown";
import { createDocument } from "@/lib/store";
import type { MarkdownFormat } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    spaceId?: string;
    title?: string;
    markdown?: string;
    parentId?: string | null;
    format?: MarkdownFormat;
    locale?: string;
  };
  if (!body.spaceId || !body.markdown?.trim()) {
    return NextResponse.json(
      { error: "spaceId and markdown required" },
      { status: 400 },
    );
  }
  const parsed = parseMarkdown(body.markdown, body.format ?? "auto");
  const title =
    body.title?.trim() ||
    parsed.frontmatter.title ||
    parsed.titleFromHeading ||
    "Imported document";
  const tags = parsed.frontmatter.tags
    ? parsed.frontmatter.tags.split(/[,\s]+/).filter(Boolean)
    : [];
  const document = await createDocument({
    spaceId: body.spaceId,
    title,
    parentId: body.parentId ?? null,
    content: repairTipTapDoc(parsed.doc),
    locale: body.locale,
    markdownFormat: parsed.format,
    tags,
    seoTitle: parsed.frontmatter.title ?? null,
    seoDescription:
      parsed.frontmatter.description || parsed.frontmatter.summary || null,
  });
  return NextResponse.json(
    { document, format: parsed.format, frontmatter: parsed.frontmatter },
    { status: 201 },
  );
}
