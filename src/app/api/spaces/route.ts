import { NextResponse } from "next/server";
import { createSpace, listSpaces } from "@/lib/store";

export async function GET() {
  const spaces = await listSpaces();
  return NextResponse.json({ spaces });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const space = await createSpace({
    name: body.name.trim(),
    description: body.description,
  });
  return NextResponse.json({ space }, { status: 201 });
}
