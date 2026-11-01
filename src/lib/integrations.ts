import type { Integration, Space } from "./types";
import { safeFetch } from "./outbound";
import { parse } from "yaml";
import { audit } from "./database";

export async function dispatchPublishHooks(
  integrations: Integration[],
  space: Space,
  portalUrl: string,
): Promise<void> {
  const enabled = integrations.filter(
    (i) => i.enabled && ["slack", "discord", "webhook"].includes(i.provider),
  );
  const results = await Promise.allSettled(
    enabled.map(async (integration) => {
      switch (integration.provider) {
        case "slack":
        case "discord": {
          const url = integration.config.webhookUrl;
          if (!url) return;
          const text = `Published **${space.name}** (${space.versionLabel}) → ${portalUrl}`;
          const response = await safeFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              integration.provider === "slack" ? { text } : { content: text },
            ),
          });
          if (!response.ok)
            throw new Error(`Notification HTTP ${response.status}`);
          break;
        }
        case "webhook": {
          const url = integration.config.url;
          if (!url) return;
          const response = await safeFetch(url, {
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
          if (!response.ok)
            throw new Error(`Notification HTTP ${response.status}`);
          break;
        }
        default:
          break;
      }
    }),
  );
  results.forEach((result, index) =>
    audit(
      "system",
      result.status === "fulfilled"
        ? "notification.sent"
        : "notification.failed",
      enabled[index].name,
    ),
  );
}

export async function importOpenApiAsMarkdown(
  specUrl: string,
): Promise<{ title: string; markdown: string }[]> {
  const res = await safeFetch(specUrl);
  if (!res.ok) throw new Error(`Failed to fetch OpenAPI spec (${res.status})`);
  const text = await res.text();
  return openApiPages(text, specUrl);
}

type JsonObject = Record<string, unknown>;
const object = (v: unknown): JsonObject =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {};
const code = (v: unknown) =>
  "\n```json\n" + JSON.stringify(v, null, 2) + "\n```\n";
export function openApiPages(text: string, source: string) {
  const spec = object(parse(text, { maxAliasCount: 50 }));
  if (!spec.openapi && !spec.swagger)
    throw new Error(
      "Le fichier doit contenir une spécification OpenAPI ou Swagger.",
    );
  function resolve(value: unknown): JsonObject {
    let v = object(value);
    const seen = new Set<string>();
    while (typeof v.$ref === "string") {
      const ref = v.$ref;
      if (!ref.startsWith("#/") || seen.has(ref)) return v;
      seen.add(ref);
      let target: unknown = spec;
      for (const key of ref.slice(2).split("/"))
        target = object(target)[key.replace(/~1/g, "/").replace(/~0/g, "~")];
      v = object(target);
    }
    return v;
  }
  const info = object(spec.info);
  const pages = [
    {
      title: String(info.title || "Référence API"),
      markdown: `# ${info.title || "Référence API"}\n\n${info.description || ""}\n\nSource : ${source}\n\n## Serveurs\n${code(spec.servers ?? spec.host ?? [])}\n## Authentification\n${code(object(spec.components).securitySchemes ?? spec.securityDefinitions ?? {})}`,
    },
  ];
  for (const [pathKey, item] of Object.entries(object(spec.paths))) {
    const methods = resolve(item);
    for (const [method, operation] of Object.entries(methods)) {
      if (
        ![
          "get",
          "post",
          "put",
          "patch",
          "delete",
          "head",
          "options",
          "trace",
        ].includes(method)
      )
        continue;
      const op = resolve(operation);
      let markdown = `# ${method.toUpperCase()} ${pathKey}\n\n${op.summary || ""}\n\n${op.description || ""}\n`;
      const parameters = [
        ...(Array.isArray(methods.parameters) ? methods.parameters : []),
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ].map(resolve);
      if (parameters.length)
        markdown +=
          "\n## Paramètres\n" +
          parameters
            .map(
              (p) =>
                `- **${p.name}** (${p.in}${p.required ? ", obligatoire" : ""}) : ${p.description || ""}\n${code(p.schema ?? p.type)}`,
            )
            .join("\n");
      const request = resolve(op.requestBody);
      if (Object.keys(request).length)
        markdown +=
          "\n## Corps de la requête\n" +
          String(request.description ?? "") +
          code(request.content);
      markdown += "\n## Réponses\n";
      for (const [status, response] of Object.entries(object(op.responses))) {
        const r = resolve(response);
        markdown += `\n### ${status}\n${r.description ?? ""}\n${code(r.content ?? r.schema ?? {})}`;
      }
      markdown += "\n## Sécurité\n" + code(op.security ?? spec.security ?? []);
      const components = object(
        object(spec.components).schemas ?? spec.definitions,
      );
      const referenced = new Set(
        markdown.match(/#\/(?:components\/schemas|definitions)\/[^"\s]+/g) ??
          [],
      );
      for (const ref of referenced) {
        const name = ref.split("/").pop()!;
        if (components[name])
          markdown += `\n## Schéma ${name}\n${code(components[name])}`;
      }
      pages.push({ title: `${method.toUpperCase()} ${pathKey}`, markdown });
      if (pages.length > 200)
        throw new Error(
          "Import limité à 200 opérations ; découpez la spécification.",
        );
    }
  }
  return pages;
}
