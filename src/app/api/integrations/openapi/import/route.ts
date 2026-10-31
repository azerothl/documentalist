import { NextResponse } from "next/server";
import { importOpenApiIntegration, listIntegrations } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      spaceId?: string;
      specUrl?: string;
    };
    let specUrl = body.specUrl?.trim();
    if (!specUrl) {
      const integrations = await listIntegrations();
      const openapi = integrations.find(
        (i) => i.provider === "openapi" && i.enabled,
      );
      specUrl = openapi?.config.specUrl;
    }
    if (!body.spaceId || !specUrl) {
      return NextResponse.json(
        { error: "spaceId and specUrl required" },
        { status: 400 },
      );
    }
    const result = await importOpenApiIntegration(body.spaceId, specUrl);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
