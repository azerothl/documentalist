import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/store";

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}
