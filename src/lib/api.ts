import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "./auth";
import { audit, rateLimit } from "./database";
import { clientData } from "./secrets";
import { GitHubReadOnlyDocumentError } from "./document-access";
import {
  documentPatchSchema,
  spacePatchSchema,
  llmSchema,
  contentSchema,
} from "./validation";

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.DOCUMENTALIST_URL || new URL(request.url).origin;
  if (!origin || origin !== new URL(expected).origin)
    throw new Error("Origine de la requête refusée.");
}

function validateBody(path: string, method: string, body: unknown) {
  if (path === "/api/comments")
    return (
      method === "POST"
        ? z.object({
            documentId: z.string().min(1),
            body: z.string().trim().min(1).max(10000),
          })
        : z.object({
            id: z.string().min(1),
            resolved: z.boolean().optional(),
            body: z.string().trim().min(1).max(10000).optional(),
          })
    ).parse(body);
  if (path === "/api/variables")
    return z
      .object({
        key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,80}$/),
        value: z.string().max(10000),
      })
      .parse(body);
  if (path === "/api/documents/reorder")
    return z
      .object({
        spaceId: z.string().min(1),
        orderedIds: z.array(z.string()).max(10000),
        parentId: z.string().nullable().optional(),
      })
      .parse(body);
  if (path === "/api/ai")
    return z
      .object({
        action: z.enum(["ask", "draft", "proofread"]),
        prompt: z.string().trim().min(1).max(20000),
        spaceId: z.string().optional(),
        documentId: z.string().optional(),
        selection: z.string().max(20000).optional(),
        scope: z.enum(["page", "related", "space"]).optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(50000),
            }),
          )
          .max(24)
          .optional(),
      })
      .parse(body);
  if (method === "POST" && path === "/api/spaces/sync")
    return z
      .object({
        spaceId: z.string().min(1),
        force: z.boolean().optional(),
      })
      .parse(body);
  if (method === "PATCH" && /^\/api\/spaces\/[^/]+$/.test(path))
    return spacePatchSchema.parse(body);
  if (method === "PATCH" && /^\/api\/documents\/[^/]+$/.test(path))
    return documentPatchSchema
      .extend({ expectedUpdatedAt: z.string().optional() })
      .parse(body);
  if (path === "/api/organization")
    return z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        llm: llmSchema.optional(),
      })
      .parse(body);
  if (path === "/api/integrations")
    return z
      .object({
        id: z.string().optional(),
        provider: z.enum([
          "github",
          "gitlab",
          "slack",
          "discord",
          "openapi",
          "webhook",
          "notion",
        ]),
        name: z.string().trim().min(1).max(200),
        enabled: z.boolean().optional(),
        config: z.record(z.string().max(80), z.string().max(4096)),
      })
      .parse(body);
  if (path === "/api/spaces")
    return z
      .object({
        name: z.string().trim().min(1).max(200),
        description: z.string().max(5000).optional(),
      })
      .parse(body);
  if (path === "/api/documents" || path === "/api/documents/import") {
    return z
      .object({
        spaceId: z.string().min(1),
        title: z.string().max(500).optional(),
        parentId: z.string().nullable().optional(),
        kind: z.enum(["page", "category", "link"]).optional(),
        content: contentSchema.optional(),
        href: z.string().nullable().optional(),
        locale: z.string().max(35).optional(),
        section: z.enum(["learn", "reference", "blog"]).optional(),
        markdown: z.string().max(1_000_000).optional(),
        format: z
          .enum(["auto", "commonmark", "gfm", "mdx", "obsidian"])
          .optional(),
      })
      .parse(body);
  }
  return z.record(z.string(), z.unknown()).parse(body);
}

export function secureRoute<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Promise<Response>,
  options: { public?: boolean; admin?: boolean } = {},
) {
  return async (request: Request, ...args: A): Promise<Response> => {
    try {
      const path = new URL(request.url).pathname;
      const user = options.public ? null : await currentUser();
      if (!options.public && !user)
        return NextResponse.json(
          { error: "Connexion requise." },
          { status: 401 },
        );
      const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
      const admin =
        options.admin ||
        path.startsWith("/api/integrations") ||
        path === "/api/organization" ||
        (request.method === "PATCH" && /^\/api\/spaces\/[^/]+$/.test(path));
      if (
        user &&
        ((admin && user.role !== "admin") ||
          (mutation && user.role === "viewer"))
      )
        return NextResponse.json(
          { error: "Vous n’avez pas les droits nécessaires." },
          { status: 403 },
        );
      if (
        !rateLimit(
          options.public ? `public:${path}` : `user:${user!.id}`,
          options.public ? 30 : 600,
        )
      )
        return NextResponse.json(
          { error: "Trop de requêtes. Réessayez dans une minute." },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      if (mutation) checkOrigin(request);
      if (
        mutation &&
        request.headers.has("content-type") &&
        !request.headers.get("content-type")?.includes("application/json")
      )
        return NextResponse.json(
          { error: "Le corps de la requête doit être au format JSON." },
          { status: 415 },
        );
      if (
        mutation &&
        request.headers.get("content-type")?.includes("application/json")
      ) {
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader)
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 2_000_000) {
              await reader.cancel();
              return NextResponse.json(
                { error: "Document trop volumineux (2 Mo maximum)." },
                { status: 413 },
              );
            }
            chunks.push(value);
          }
        const raw = Buffer.concat(chunks).toString("utf8");
        if (raw) {
          // Limit nesting before invoking recursive document schemas.
          let depth = 0;
          for (const c of raw.replace(/"(?:[^"\\]|\\.)*"/g, '""')) {
            if (c === "{" || c === "[") depth++;
            else if (c === "}" || c === "]") depth--;
            if (depth > 80) throw new Error("Document trop imbriqué.");
          }
          const body = validateBody(path, request.method, JSON.parse(raw));
          request = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(body),
          });
        }
      }
      const response = await handler(request, ...args);
      if (mutation && user && response.ok)
        audit(user.email, request.method, path);
      response.headers.set("Cache-Control", "private, no-store");
      if (response.headers.get("Content-Type")?.includes("application/json")) {
        return NextResponse.json(clientData(await response.json()), {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Données invalides : " +
            error.issues.map((i) => i.path.join(".")).join(", ")
          : error instanceof Error
            ? error.message
            : "Requête invalide.";
      console.error("API:", error instanceof Error ? error.name : "unknown");
      return NextResponse.json(
        { error: message },
        {
          status:
            error instanceof GitHubReadOnlyDocumentError
              ? 403
              : message.includes("Conflit")
                ? 409
                : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
}
