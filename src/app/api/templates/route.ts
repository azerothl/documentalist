import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/store";

async function handleGET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export const GET = secureRoute(handleGET);
