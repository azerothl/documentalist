import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("Parcours HTTP avec données isolées", { timeout: 180_000 }, async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "documentalist-http-"));
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const origin = `http://localhost:${port}`;
  const server = spawn(
    process.execPath,
    [
      "--require",
      "./scripts/windows-readlink.cjs",
      "node_modules/next/dist/bin/next",
      "start",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DOCUMENTALIST_DATA_DIR: temp,
        DOCUMENTALIST_URL: origin,
        DOCUMENTALIST_COOKIE_SECURE: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let logs = "";
  server.stdout.on("data", (v) => (logs += v));
  server.stderr.on("data", (v) => (logs += v));
  let cookie = "";
  async function request(
    url: string,
    method = "GET",
    body?: unknown,
    session = cookie,
    requestOrigin = origin,
  ) {
    return fetch(origin + url, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Cookie: session } : {}),
        ...(method !== "GET" ? { Origin: requestOrigin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  }
  async function json(url: string, method = "GET", body?: unknown) {
    const res = await request(url, method, body);
    const data = await res.json();
    assert.ok(res.ok, `${url}: ${res.status} ${JSON.stringify(data)}`);
    return data;
  }
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try {
        const res = await fetch(origin + "/setup");
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      if (server.exitCode !== null) throw new Error(logs);
      await delay(250);
    }
    assert.ok(ready, "Le serveur doit démarrer : " + logs.slice(-2000));
    await t.test("aucune API privée avant connexion", async () => {
      assert.equal((await request("/api/spaces")).status, 401);
      const r = await request("/app");
      assert.ok([307, 308].includes(r.status));
    });
    await t.test("initialisation unique et session HttpOnly", async () => {
      assert.equal(
        (await request("/api/auth/setup", "POST", { token: "incorrect" }))
          .status,
        403,
      );
      const token = await readFile(path.join(temp, "setup-token"), "utf8");
      await json("/api/auth/setup", "POST", {
        token,
        email: "admin@example.org",
        name: "Admin",
        password: "long-admin-password",
      });
      assert.equal(
        (
          await request("/api/auth/setup", "POST", {
            token,
            email: "other@example.org",
            password: "long-password",
          })
        ).status,
        409,
      );
      const r = await request("/api/auth/login", "POST", {
        email: "admin@example.org",
        password: "long-admin-password",
      });
      assert.equal(r.status, 200);
      const header = r.headers.get("set-cookie")!;
      assert.match(header, /HttpOnly/i);
      assert.match(header, /SameSite=lax/i);
      cookie = header.split(";")[0];
    });
    let spaceId = "";
    let slug = "";
    let documentId = "";
    await t.test(
      "réglages et intégrations sans fuite des secrets",
      async () => {
        const created = await json("/api/spaces", "POST", {
          name: "Portail sécurisé",
        });
        spaceId = created.space.id;
        slug = created.space.slug;
        await json(`/api/spaces/${spaceId}`, "PATCH", {
          accessPassword: "portal-long-password",
          llm: {
            enabled: true,
            provider: "openai",
            apiKey: "VERY_PRIVATE_LLM_KEY",
            model: "example",
            baseUrl: "https://api.openai.com/v1",
          },
        });
        await json("/api/integrations", "POST", {
          provider: "github",
          name: "GitHub",
          config: { token: "VERY_PRIVATE_GH_TOKEN" },
        });
        const response = JSON.stringify(await json(`/api/spaces/${spaceId}`));
        assert.ok(!response.includes("VERY_PRIVATE"));
        assert.ok(!response.includes("scrypt:"));
        const integration = JSON.stringify(await json("/api/integrations"));
        assert.ok(!integration.includes("VERY_PRIVATE_GH_TOKEN"));
      },
    );
    await t.test("édition, import/export et restauration", async () => {
      const imported = await json("/api/documents/import", "POST", {
        spaceId,
        title: "Guide privé",
        markdown: "# Guide\n\nUNIQUE_PROTECTED_CONTENT\n\n- étape 1",
      });
      documentId = imported.document.id;
      const exported = await request(`/api/documents/${documentId}/export`);
      assert.match(await exported.text(), /UNIQUE_PROTECTED_CONTENT/);
      await json(`/api/documents/${documentId}`, "PATCH", {
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Remplacement" }],
            },
          ],
        },
      });
      assert.equal(
        (
          await request(`/api/documents/${documentId}`, "PATCH", {
            title: "Écrasement interdit",
            expectedUpdatedAt: imported.document.updatedAt,
          })
        ).status,
        409,
      );
      const { revisions } = await json(`/api/documents/${documentId}`);
      assert.ok(revisions.length > 0);
      await json(`/api/documents/${documentId}/restore`, "POST", {
        revisionId: revisions[0].id,
      });
      assert.match(
        JSON.stringify(await json(`/api/documents/${documentId}`)),
        /UNIQUE_PROTECTED_CONTENT/,
      );
    });
    await t.test(
      "portail verrouillé côté serveur, pages masquées absentes",
      async () => {
        const hidden = await json("/api/documents", "POST", {
          spaceId,
          title: "HIDDEN_PAGE_NEVER_EXPOSED",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "HIDDEN_BODY_NEVER_EXPOSED" }],
              },
            ],
          },
        });
        await json(`/api/documents/${hidden.document.id}`, "PATCH", {
          hidden: true,
        });
        await json(`/api/spaces/${spaceId}/publish`, "POST");
        const locked = await request(`/p/${slug}`);
        const html = await locked.text();
        assert.ok(!html.includes("UNIQUE_PROTECTED_CONTENT"));
        assert.ok(!html.includes("VERY_PRIVATE"));
        assert.ok(!html.includes("scrypt:"));
        assert.ok(!html.includes("portal-long-password"));
        assert.equal(
          (
            await request(
              "/api/portal/unlock",
              "POST",
              { slug, password: "wrong" },
              "",
            )
          ).status,
          403,
        );
        const unlock = await request(
          "/api/portal/unlock",
          "POST",
          { slug, password: "portal-long-password" },
          "",
        );
        assert.equal(unlock.status, 200);
        const portalCookie = unlock.headers.get("set-cookie")!.split(";")[0];
        const visible = await request(
          `/p/${slug}`,
          "GET",
          undefined,
          portalCookie,
        );
        const body = await visible.text();
        assert.ok(body.includes("UNIQUE_PROTECTED_CONTENT"));
        assert.ok(!body.includes("VERY_PRIVATE"));
        assert.ok(!body.includes("HIDDEN_PAGE_NEVER_EXPOSED"));
        const unknown = await request(
          `/p/${slug}/absent`,
          "GET",
          undefined,
          portalCookie,
        );
        assert.equal(unknown.status, 404);
      },
    );
    await t.test(
      "rôles, protection intersites, validation et réseau",
      async () => {
        for (const role of ["viewer", "editor"]) {
          await json("/api/admin/team", "POST", {
            email: `${role}@example.org`,
            name: role,
            password: "long-user-password",
            role,
          });
          const r = await request("/api/auth/login", "POST", {
            email: `${role}@example.org`,
            password: "long-user-password",
          });
          const session = r.headers.get("set-cookie")!.split(";")[0];
          assert.equal(
            (
              await request(
                "/api/organization",
                "PATCH",
                { name: "Forbidden" },
                session,
              )
            ).status,
            403,
          );
          if (role === "viewer")
            assert.equal(
              (
                await request(
                  `/api/documents/${documentId}`,
                  "DELETE",
                  undefined,
                  session,
                )
              ).status,
              403,
            );
        }
        assert.equal(
          (
            await request(
              `/api/spaces/${spaceId}`,
              "PATCH",
              { name: "CSRF" },
              cookie,
              "https://attacker.example",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(`/api/spaces/${spaceId}`, "PATCH", {
              customCss: "</style><script>bad()</script>",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/api/documents/reorder", "POST", {
              spaceId,
              orderedIds: [documentId],
              parentId: documentId,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/api/integrations/openapi/import", "POST", {
              spaceId,
              specUrl: "http://169.254.169.254/latest/meta-data",
            })
          ).status,
          400,
        );
      },
    );
    await t.test("MCP : protocole, publications et permissions révocables", async () => {
      const publicSpace = (await json("/api/spaces", "POST", { name: "MCP public" })).space;
      const privateSpace = (await json("/api/spaces", "POST", { name: "MCP private" })).space;
      const content = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
      await json("/api/documents", "POST", { spaceId: publicSpace.id, title: "Public MCP page", content: content("PUBLIC_MCP_CONTENT") });
      const published = (await json("/api/documents", "POST", { spaceId: privateSpace.id, title: "Private MCP page", content: content("PRIVATE_PUBLISHED_MCP_CONTENT") })).document;
      const hidden = (await json("/api/documents", "POST", { spaceId: privateSpace.id, title: "Hidden MCP", content: content("HIDDEN_MCP_CONTENT") })).document;
      await json(`/api/documents/${hidden.id}`, "PATCH", { hidden: true });
      const child = (await json("/api/documents", "POST", { spaceId: privateSpace.id, parentId: hidden.id, title: "Hidden child", content: content("HIDDEN_CHILD_MCP_CONTENT") })).document;
      await json(`/api/spaces/${publicSpace.id}/publish`, "POST", { accessMode: "public" });
      await json(`/api/spaces/${privateSpace.id}/publish`, "POST", { accessMode: "password", accessPassword: "private-mcp-test-code" });
      await json(`/api/documents/${published.id}`, "PATCH", { content: content("UNPUBLISHED_MCP_DRAFT") });
      const member = (await json("/api/admin/team", "POST", { email: "mcp-reader@example.org", name: "MCP reader", role: "viewer", password: "long-mcp-reader-password", spaceScope: "selected", spaceIds: [privateSpace.id] })).user;
      assert.equal((await request("/api/mcp/connections", "POST", { name: "Invalid scope", userId: member.id, spaceIds: [publicSpace.id] })).status, 400);
      const connection = await json("/api/mcp/connections", "POST", { name: "Test agent", userId: member.id, spaceIds: [privateSpace.id], days: 1 });
      const list = await json("/api/mcp/connections");
      assert.ok(!JSON.stringify(list).includes(connection.accessKey));
      assert.ok(!JSON.stringify(list).includes("key_hash"));
      const publicClient = new Client({ name: "anonymous-test", version: "1" });
      const privateClient = new Client({ name: "private-test", version: "1" });
      try {
        await publicClient.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp")));
        await privateClient.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${connection.accessKey}` } } }));
        assert.deepEqual((await privateClient.listTools()).tools.map((tool) => tool.name).sort(), ["list_pages", "list_spaces", "read_page", "search_docs"]);
        const publicList = JSON.stringify(await publicClient.callTool({ name: "list_spaces", arguments: {} }));
        assert.ok(publicList.includes(publicSpace.id));
        assert.ok(!publicList.includes(privateSpace.id));
        assert.equal((await publicClient.callTool({ name: "read_page", arguments: { spaceId: privateSpace.id, documentId: published.id } })).isError, true);
        const privateList = JSON.stringify(await privateClient.callTool({ name: "list_spaces", arguments: {} }));
        assert.ok(privateList.includes(privateSpace.id));
        assert.ok(!privateList.includes(publicSpace.id));
        const read = JSON.stringify(await privateClient.callTool({ name: "read_page", arguments: { spaceId: privateSpace.id, documentId: published.id } }));
        assert.ok(read.includes("PRIVATE_PUBLISHED_MCP_CONTENT"));
        assert.ok(read.includes("?lang="));
        assert.ok(!read.includes("UNPUBLISHED_MCP_DRAFT"));
        const pages = JSON.stringify(await privateClient.callTool({ name: "list_pages", arguments: { spaceId: privateSpace.id, locale: "en", limit: 100 } }));
        assert.ok(!pages.includes(hidden.id));
        assert.ok(!pages.includes(child.id));
        for (const id of [hidden.id, child.id]) assert.equal((await privateClient.callTool({ name: "read_page", arguments: { spaceId: privateSpace.id, documentId: id } })).isError, true);
        assert.ok(JSON.stringify(await privateClient.callTool({ name: "search_docs", arguments: { query: "PRIVATE_PUBLISHED_MCP_CONTENT" } })).includes(published.id));
        assert.ok(!JSON.stringify(await privateClient.callTool({ name: "search_docs", arguments: { query: "UNPUBLISHED_MCP_DRAFT" } })).includes(published.id));
        await json("/api/admin/team", "PATCH", { id: member.id, spaceScope: "selected", spaceIds: [publicSpace.id] });
        assert.ok(!JSON.stringify(await privateClient.callTool({ name: "list_spaces", arguments: {} })).includes(privateSpace.id));
        await json("/api/admin/team", "PATCH", { id: member.id, disabled: true });
        const authRequest = () => fetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${connection.accessKey}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
        assert.equal((await authRequest()).status, 401);
        await json("/api/admin/team", "PATCH", { id: member.id, disabled: false });
        await json("/api/mcp/connections", "DELETE", { id: connection.id });
        assert.equal((await authRequest()).status, 401);
        assert.equal((await fetch(origin + "/mcp", { method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
      } finally { await Promise.allSettled([publicClient.close(), privateClient.close()]); }
    });
    await t.test(
      "sauvegarde téléchargeable et journal d’activité",
      async () => {
        const state = await json("/api/admin/team");
        assert.ok(state.activity.length > 0);
        assert.ok(state.backups.length > 0);
        const backup = await request("/api/admin/backup");
        assert.equal(backup.status, 200);
        const bytes = Buffer.from(await backup.arrayBuffer());
        assert.equal(bytes.subarray(0, 15).toString(), "SQLite format 3");
        assert.ok(!bytes.includes(Buffer.from("VERY_PRIVATE_LLM_KEY")));
        const marker = await json("/api/spaces", "POST", {
          name: "État à annuler",
        });
        await json("/api/admin/backup", "POST", {
          // Restore a snapshot known to predate the marker. Reading team data
          // can also migrate newly created spaces and record another snapshot.
          revision: state.backups[0].revision,
        });
        const afterRestore = await json("/api/spaces");
        assert.ok(
          !afterRestore.spaces.some(
            (s: { id: string }) => s.id === marker.space.id,
          ),
        );
        const admin = state.users.find(
          (u: { role: string }) => u.role === "admin",
        );
        assert.equal(
          (
            await request("/api/admin/team", "PATCH", {
              id: admin.id,
              disabled: true,
            })
          ).status,
          400,
        );
      },
    );
  } finally {
    server.kill();
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", () => resolve());
    });
    await rm(temp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});
