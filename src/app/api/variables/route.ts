import { NextResponse } from "next/server";
import { listVariables, upsertVariable } from "@/lib/store";

export async function GET() {
  const variables = await listVariables();
  return NextResponse.json({ variables });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { key?: string; value?: string };
  if (!body.key?.trim()) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  const variable = await upsertVariable(body.key.trim(), body.value ?? "");
  return NextResponse.json({ variable });
}
