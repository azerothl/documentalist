import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { searchDocuments } from "@/lib/store";

async function handleGET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const spaceId = searchParams.get("spaceId") ?? undefined;
  const publishedOnly = searchParams.get("published") === "1";
  const results = await searchDocuments(q, { spaceId, publishedOnly });
  return NextResponse.json({ results });
}

export const GET = secureRoute(handleGET);
