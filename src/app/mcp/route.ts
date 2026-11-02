import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/lib/mcp-access";
import { createDocumentationMcp } from "@/lib/mcp-server";
import { database, rateLimit } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const baseUrl = process.env.DOCUMENTALIST_URL || new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(baseUrl).origin)
    return Response.json(
      { error: "Origin not allowed." },
      { status: 403, headers },
    );
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(
    /^Bearer (doc_mcp_[A-Za-z0-9_-]{43})$/i,
  )?.[1];
  const principal = bearer ? authenticateMcp(bearer) : null;
  if (authorization && !principal)
    return Response.json(
      { error: "Invalid, expired or revoked MCP access key." },
      {
        status: 401,
        headers: {
          ...headers,
          "WWW-Authenticate": 'Bearer realm="documentalist-mcp"',
        },
      },
    );
  if (
    !rateLimit(
      principal ? `mcp:${principal.connectionId}` : "mcp:public",
      principal ? 120 : 60,
    )
  )
    return Response.json(
      { error: "Too many requests." },
      { status: 429, headers: { ...headers, "Retry-After": "60" } },
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "JSON required." }, { status: 415, headers });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        return Response.json(
          { error: "Request too large." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createDocumentationMcp(principal, baseUrl);
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    );
    response.headers.set("Cache-Control", "private, no-store");
    if (principal && response.ok)
      database()
        .prepare("UPDATE mcp_connections SET last_used_at=? WHERE id=?")
        .run(Date.now(), principal.connectionId);
    return response;
  } catch {
    return Response.json(
      { error: "MCP request failed." },
      { status: 500, headers },
    );
  } finally {
    await server.close();
  }
}

function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
