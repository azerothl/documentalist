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
  // Local SMTP sink: keeps every message so magic links can be followed.
  const mails: { to: string; text: string }[] = [];
  const smtp = createServer((connection) => {
    let buffer = "";
    let data = false;
    let to = "";
    const reply = (line: string) => connection.write(line + "\r\n");
    reply("220 sink.example.test");
    connection.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === ".") {
            data = false;
            mails.at(-1)!.text = mails.at(-1)!.text
              .replace(/=\r?\n/g, "")
              .replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
            reply("250 queued");
          } else mails.at(-1)!.text += line + "\n";
          continue;
        }
        const verb = line.split(" ")[0].toUpperCase();
        if (verb === "EHLO") reply("250 sink.example.test");
        else if (verb === "RCPT") {
          to = line.slice(8).replace(/[<>]/g, "").trim();
          reply("250 OK");
        } else if (verb === "DATA") {
          data = true;
          mails.push({ to, text: "" });
          reply("354 go ahead");
        } else if (verb === "QUIT") {
          reply("221 bye");
          connection.end();
        } else reply("250 OK");
      }
    });
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const smtpPort = (smtp.address() as { port: number }).port;
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
        DOCUMENTALIST_SMTP_URL: `smtp://127.0.0.1:${smtpPort}`,
        DOCUMENTALIST_EMAIL_FROM: "Documentalist <docs@example.test>",
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
    await t.test("guide publié : Learn et anciens liens Reference en français et anglais", async () => {
      for (const [url, title] of [
        ["/p/product-docs/reference/getting-started/core-concepts?lang=en", "Core concepts"],
        ["/p/product-docs/reference/getting-started/core-concepts?lang=fr", "Concepts"],
        ["/p/product-docs/learn/connect-an-agent?lang=en", "Connect an external agent"],
        ["/p/product-docs/learn/connect-an-agent?lang=fr", "Connecter un agent externe"],
      ]) {
        const response = await request(url, "GET", undefined, "");
        assert.equal(response.status, 200, url);
        assert.ok((await response.text()).includes(title), url);
      }
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
      const login = await request("/api/auth/login", "POST", { email: "mcp-reader@example.org", password: "long-mcp-reader-password" });
      const memberSession = login.headers.get("set-cookie")!.split(";")[0];
      for (const role of ["viewer", "editor"]) {
        await json("/api/admin/team", "PATCH", { id: member.id, role });
        const workspace = await request(`/app?space=${privateSpace.id}`, "GET", undefined, memberSession);
        assert.equal(workspace.status, 200);
        assert.ok(!(await workspace.text()).includes(publicSpace.id), "le rendu serveur ne doit pas exposer les autres espaces");
        assert.equal((await request(`/app?space=${publicSpace.id}`, "GET", undefined, memberSession)).status, 404);
      }
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
    await t.test("lien magique : dernier jour d’accès par lecteur", async () => {
      const day = (offset: number) =>
        new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const created = await json("/api/spaces", "POST", { name: "Lecteurs datés" });
      const id = created.space.id;
      const portal = `/p/${created.space.slug}`;
      const invites = `/api/spaces/${id}/access/invites`;
      await json(`/api/spaces/${id}`, "PATCH", { accessMode: "magic_link" });
      async function lastLink(to: string) {
        for (let i = 0; i < 40 && !mails.some((m) => m.to === to); i++) await delay(50);
        const mail = mails.filter((m) => m.to === to).at(-1);
        assert.ok(mail, `no mail for ${to}`);
        return /\/portal\/access\?token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
      }
      async function open(token: string) {
        const res = await request("/api/portal/magic-link/consume", "POST", { token }, "");
        return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
      }
      async function reads(session: string) {
        const html = await (await request(portal, "GET", undefined, session)).text();
        return !html.includes('name="email"') && html.includes("Welcome");
      }
      assert.equal((await request(invites, "POST", { email: "dated@example.test", expiresOn: "2026-02-30" })).status, 400);
      assert.equal((await request(invites, "POST", { email: "dated@example.test", expiresOn: day(-1) })).status, 400);
      await json(invites, "POST", { email: "legacy@example.test" });
      await json(invites, "POST", { email: "Dated@Example.test", expiresOn: day(0) });
      await json(`/api/spaces/${id}/publish`, "POST", { accessMode: "magic_link" });
      assert.deepEqual(await json(invites), {
        emails: ["legacy@example.test", "dated@example.test"],
        expirations: { "dated@example.test": day(0) },
      });
      // The general space payload carries neither the addresses nor their dates.
      assert.ok(!JSON.stringify(await json(`/api/spaces/${id}`)).includes("dated@example.test"));
      // Before the end (the last day is included): the reader gets in.
      const dated = await open(await lastLink("dated@example.test"));
      assert.equal(dated.status, 200);
      assert.ok(await reads(dated.cookie));
      const legacy = await open(await lastLink("legacy@example.test"));
      assert.ok(await reads(legacy.cookie));
      // A second link requested before the end stays unused.
      const before = mails.length;
      await json("/api/portal/magic-link/request", "POST", { slug: created.space.slug, email: "dated@example.test" });
      const pending = await lastLink("dated@example.test");
      assert.equal(mails.length, before + 1);
      // The end date moves to yesterday: session, old link and new request are refused.
      await json(invites, "PATCH", { email: "dated@example.test", expiresOn: day(-1) });
      assert.equal((await json(invites)).expirations["dated@example.test"], day(-1));
      assert.ok(!(await reads(dated.cookie)));
      assert.equal((await open(pending)).status, 409);
      await json("/api/portal/magic-link/request", "POST", { slug: created.space.slug, email: "dated@example.test" });
      await delay(300);
      assert.equal(mails.length, before + 1);
      // Re-inviting an expired reader needs a new date.
      assert.equal((await request(invites, "POST", { email: "dated@example.test" })).status, 400);
      // The invitation without a date is untouched.
      assert.ok(await reads(legacy.cookie));
      // Clearing the date reopens the same session; revocation closes it at once.
      await json(invites, "PATCH", { email: "dated@example.test", expiresOn: null });
      assert.deepEqual((await json(invites)).expirations, {});
      assert.ok(await reads(dated.cookie));
      await json(invites, "DELETE", { email: "dated@example.test" });
      assert.ok(!(await reads(dated.cookie)));
      assert.equal((await request(invites, "PATCH", { email: "dated@example.test", expiresOn: day(3) })).status, 404);
      assert.deepEqual((await json(invites)).emails, ["legacy@example.test"]);
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
    await t.test("expiration du lecteur : lien existant, session et nouvelle demande", async () => {
      const created = await json("/api/spaces", "POST", { name: "Lecteurs temporaires" });
      const id = created.space.id as string;
      const portalSlug = created.space.slug as string;
      await json(`/api/spaces/${id}`, "PATCH", { accessMode: "magic_link" });
      const document = await json("/api/documents/import", "POST", { spaceId: id, title: "Secret", markdown: "# Secret\n\nEXPIRY_PRIVATE_CONTENT" });
      const directUrl = `/p/${portalSlug}/reference/${document.document.slug}`;
      const previousDirectory = process.env.DOCUMENTALIST_DATA_DIR;
      process.env.DOCUMENTALIST_DATA_DIR = temp;
      const store = await import("../src/lib/store");
      const auth = await import("../src/lib/auth");
      const { database } = await import("../src/lib/database");
      const email = "expiry-reader@example.org";
      try {
        await store.updateSpaceAllowedEmail(id, email, true, "2099-12-31");
        await json(`/api/spaces/${id}/publish`, "POST", { accessMode: "magic_link" });
        const first = auth.createPortalMagicToken(id, email);
        const consume = await request("/api/portal/magic-link/consume", "POST", { token: first }, "");
        assert.equal(consume.status, 200);
        const readerCookie = consume.headers.get("set-cookie")!.split(";")[0];
        assert.match(await (await request(`/p/${portalSlug}`, "GET", undefined, readerCookie)).text(), /EXPIRY_PRIVATE_CONTENT/);
        assert.match(await (await request(directUrl, "GET", undefined, readerCookie)).text(), /EXPIRY_PRIVATE_CONTENT/);
        const oldLink = auth.createPortalMagicToken(id, email);
        await json(`/api/spaces/${id}/access/invites`, "PATCH", { email, expiresOn: "2000-01-01" });
        assert.equal((await json(`/api/spaces/${id}/access/invites`)).expirations[email], "2000-01-01");
        assert.doesNotMatch(await (await request(`/p/${portalSlug}`, "GET", undefined, readerCookie)).text(), /EXPIRY_PRIVATE_CONTENT/);
        assert.doesNotMatch(await (await request(directUrl, "GET", undefined, readerCookie)).text(), /EXPIRY_PRIVATE_CONTENT/);
        assert.equal((await request("/api/portal/magic-link/consume", "POST", { token: oldLink }, "")).status, 409);
        const count = () => (database().prepare("SELECT count(*) AS n FROM portal_magic_tokens WHERE space_id=?").get(id) as { n: number }).n;
        const before = count();
        assert.equal((await request("/api/portal/magic-link/request", "POST", { slug: portalSlug, email }, "")).status, 200);
        assert.equal(count(), before);
        await json(`/api/spaces/${id}/access/invites`, "PATCH", { email, expiresOn: "2099-12-31" });
        await json(`/api/spaces/${id}/access/invites`, "DELETE", { email });
        assert.doesNotMatch(await (await request(`/p/${portalSlug}`, "GET", undefined, readerCookie)).text(), /EXPIRY_PRIVATE_CONTENT/);
      } finally {
        database().close();
        if (previousDirectory === undefined) delete process.env.DOCUMENTALIST_DATA_DIR;
        else process.env.DOCUMENTALIST_DATA_DIR = previousDirectory;
      }
    });
  } finally {
    server.kill();
    smtp.close();
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
