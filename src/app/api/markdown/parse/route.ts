import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { detectMarkdownFormat, parseMarkdown } from "@/lib/markdown";
import type { MarkdownFormat } from "@/lib/types";

async function handlePOST(request: Request) {
  const body = (await request.json()) as {
    markdown?: string;
    format?: MarkdownFormat;
  };
  if (!body.markdown) {
    return NextResponse.json({ error: "markdown required" }, { status: 400 });
  }
  const detected = detectMarkdownFormat(body.markdown);
  const parsed = parseMarkdown(body.markdown, body.format ?? "auto");
  return NextResponse.json({
    detected,
    format: parsed.format,
    frontmatter: parsed.frontmatter,
    titleFromHeading: parsed.titleFromHeading,
    doc: parsed.doc,
  });
}

export const POST = secureRoute(handlePOST);
