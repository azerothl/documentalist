import { NextResponse } from "next/server";
import {
  deleteIntegration,
  listIntegrations,
  upsertIntegration,
} from "@/lib/store";
import type { IntegrationProvider } from "@/lib/types";

export async function GET() {
  const integrations = await listIntegrations();
  return NextResponse.json({ integrations });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    provider?: IntegrationProvider;
    name?: string;
    enabled?: boolean;
    config?: Record<string, string>;
  };
  if (!body.provider || !body.name?.trim()) {
    return NextResponse.json(
      { error: "provider and name required" },
      { status: 400 },
    );
  }
  const integration = await upsertIntegration({
    id: body.id,
    provider: body.provider,
    name: body.name.trim(),
    enabled: body.enabled,
    config: body.config ?? {},
  });
  return NextResponse.json({ integration }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = await deleteIntegration(id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
