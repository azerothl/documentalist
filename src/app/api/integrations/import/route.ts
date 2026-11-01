import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { listIntegrations, importRepositoryFiles } from "@/lib/store";
import { gitlabFiles, notionFiles } from "@/lib/remote-imports";
export const POST = secureRoute(async (request) => {
  const input = z
    .object({
      provider: z.enum(["gitlab", "notion"]),
      repository: z.string().max(200).optional(),
      branch: z.string().max(200).default("main"),
      path: z.string().max(500).default("docs"),
      rootPageId: z.string().max(100).optional(),
      spaceName: z.string().max(200).optional(),
      autoSync: z.boolean().optional(),
      syncIntervalMinutes: z.number().int().min(5).max(24 * 60).optional(),
    })
    .parse(await request.json());
  const integration = (await listIntegrations()).find(
    (i) => i.provider === input.provider && i.enabled,
  );
  if (!integration)
    throw new Error("Enregistrez et activez l’intégration avant l’import.");
  const files =
    input.provider === "gitlab"
      ? await gitlabFiles({
          host: integration.config.host,
          token: integration.config.token,
          repository: input.repository ?? "",
          branch: input.branch,
          path: input.path,
        })
      : await notionFiles(
          integration.config.token,
          input.rootPageId || integration.config.rootPageId,
        );
  const result = await importRepositoryFiles(
    {
      ...input,
      path: input.provider === "notion" ? "docs" : input.path,
      format: "auto",
    },
    files,
  );
  return NextResponse.json(
    { ...result, warnings: "warnings" in files ? files.warnings : [] },
    { status: 201 },
  );
});
