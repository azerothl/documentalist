import type { Integration, Space } from "./types";

export async function dispatchPublishHooks(
  integrations: Integration[],
  space: Space,
  portalUrl: string,
): Promise<void> {
  const enabled = integrations.filter((i) => i.enabled);
  await Promise.allSettled(
    enabled.map(async (integration) => {
      switch (integration.provider) {
        case "slack":
        case "discord": {
          const url = integration.config.webhookUrl;
          if (!url) return;
          const text = `Published **${space.name}** (${space.versionLabel}) → ${portalUrl}`;
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              integration.provider === "slack"
                ? { text }
                : { content: text },
            ),
          });
          break;
        }
        case "webhook": {
          const url = integration.config.url;
          if (!url) return;
          await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(integration.config.secret
                ? { "X-Documentalist-Secret": integration.config.secret }
                : {}),
            },
            body: JSON.stringify({
              event: "space.published",
              space: {
                id: space.id,
                name: space.name,
                slug: space.slug,
                versionLabel: space.versionLabel,
              },
              portalUrl,
              at: new Date().toISOString(),
            }),
          });
          break;
        }
        default:
          break;
      }
    }),
  );
}

export async function importOpenApiAsMarkdown(
  specUrl: string,
): Promise<{ title: string; markdown: string }[]> {
  const res = await fetch(specUrl, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch OpenAPI spec (${res.status})`);
  const text = await res.text();
  let spec: {
    info?: { title?: string; description?: string };
    paths?: Record<string, Record<string, { summary?: string; description?: string }>>;
  };
  try {
    spec = JSON.parse(text) as typeof spec;
  } catch {
    // YAML: keep a single overview page
    return [
      {
        title: "OpenAPI spec",
        markdown: `# OpenAPI\n\nImported from \`${specUrl}\`.\n\n\`\`\`yaml\n${text.slice(0, 12000)}\n\`\`\`\n`,
      },
    ];
  }

  const pages: { title: string; markdown: string }[] = [
    {
      title: spec.info?.title || "API reference",
      markdown: `# ${spec.info?.title || "API reference"}\n\n${spec.info?.description || "Imported from OpenAPI."}\n\nSource: \`${specUrl}\`\n`,
    },
  ];

  for (const [pathKey, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== "object") continue;
      pages.push({
        title: `${method.toUpperCase()} ${pathKey}`,
        markdown: `# ${method.toUpperCase()} \`${pathKey}\`\n\n${op.summary || ""}\n\n${op.description || ""}\n`,
      });
    }
  }
  return pages.slice(0, 60);
}
