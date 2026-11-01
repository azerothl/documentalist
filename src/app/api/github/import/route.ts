import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { listIntegrations, importGithubRepo } from "@/lib/store";
import type { MarkdownFormat } from "@/lib/types";

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as {
      repository?: string;
      branch?: string;
      path?: string;
      learnPath?: string;
      blogPath?: string;
      token?: string;
      spaceName?: string;
      format?: MarkdownFormat;
      locale?: string;
      useSavedToken?: boolean;
      autoSync?: boolean;
      syncIntervalMinutes?: number;
      spaceId?: string;
    };
    if (!body.repository?.trim()) {
      return NextResponse.json(
        { error: "repository required (owner/repo)" },
        { status: 400 },
      );
    }

    let token = body.token ?? null;
    if (body.useSavedToken !== false && !token) {
      const integrations = await listIntegrations();
      const gh = integrations.find((i) => i.provider === "github" && i.enabled);
      token = gh?.config.token || null;
    }

    const result = await importGithubRepo({
      repository: body.repository.trim(),
      branch: body.branch,
      path: body.path,
      learnPath: body.learnPath,
      blogPath: body.blogPath,
      token,
      spaceName: body.spaceName,
      format: body.format ?? "auto",
      locale: body.locale,
      autoSync: body.autoSync,
      syncIntervalMinutes: body.syncIntervalMinutes,
      spaceId: body.spaceId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = secureRoute(handlePOST);
