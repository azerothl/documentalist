import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { listSnippets } from "@/lib/store";

async function handleGET() {
  const snippets = await listSnippets();
  return NextResponse.json({ snippets });
}

export const GET = secureRoute(handleGET);
