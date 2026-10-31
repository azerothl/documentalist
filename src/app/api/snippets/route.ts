import { NextResponse } from "next/server";
import { listSnippets } from "@/lib/store";

export async function GET() {
  const snippets = await listSnippets();
  return NextResponse.json({ snippets });
}
