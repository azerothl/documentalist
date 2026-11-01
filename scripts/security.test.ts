import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Sécurité, publication et persistance", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "documentalist-unit-"));
  process.env.DOCUMENTALIST_DATA_DIR = dir;
  const { createSeedStore } = await import("../src/lib/seed");
  const fixture = createSeedStore();
  fixture.organization.llm.apiKey = "private-key-never-in-client";
  fixture.spaces[0].accessPassword = "portal-secret-password";
  await writeFile(path.join(dir, "store.json"), JSON.stringify(fixture));
  const store = await import("../src/lib/store");
  const { database, decrypt, encrypt } = await import("../src/lib/database");
  const { hashPassword, verifyPassword, createUser, login } =
    await import("../src/lib/auth");
  const { clientData, SECRET_MASK } = await import("../src/lib/secrets");
  const { publicPortalData } = await import("../src/lib/portal");
  const { publicAddress, validateOutboundUrl, safeFetch } =
    await import("../src/lib/outbound");
  const { openApiPages } = await import("../src/lib/integrations");
  try {
    await t.test("migration conservatrice et stockage chiffré", async () => {
      const data = await store.readStore();
      assert.equal(data.documents.length, fixture.documents.length);
      assert.equal(
        data.organization.llm.apiKey,
        fixture.organization.llm.apiKey,
      );
      assert.ok(
        verifyPassword(
          "portal-secret-password",
          data.spaces[0].accessPassword!,
        ),
      );
      const raw = database().prepare("SELECT payload FROM state").get() as {
        payload: string;
      };
      assert.ok(!raw.payload.includes("private-key"));
      assert.equal(
        JSON.parse(decrypt(raw.payload)).organization.llm.apiKey,
        fixture.organization.llm.apiKey,
      );
      assert.equal(
        JSON.parse(
          decrypt(await readFile(path.join(dir, "legacy-backup.enc"), "utf8")),
        ).documents.length,
        fixture.documents.length,
      );
      await assert.rejects(readFile(path.join(dir, "store.json")));
      assert.throws(() => decrypt(encrypt("valid").slice(0, -4) + "AAAA"));
    });
    await t.test(
      "secrets masqués et conservation lors d’une mise à jour",
      async () => {
        const safe = clientData(
          await store.getWorkspacePayload(fixture.spaces[0].id),
        );
        assert.equal(safe!.organization.llm.apiKey, SECRET_MASK);
        assert.ok(!JSON.stringify(safe).includes("portal-secret-password"));
        await store.updateOrganization({
          llm: {
            ...fixture.organization.llm,
            apiKey: SECRET_MASK,
            model: "new-model",
          },
        });
        assert.equal(
          (await store.readStore()).organization.llm.apiKey,
          fixture.organization.llm.apiKey,
        );
        await store.updateOrganization({
          llm: { ...fixture.organization.llm, apiKey: "" },
        });
        assert.equal((await store.readStore()).organization.llm.apiKey, "");
      },
    );
    await t.test(
      "portail sans secrets, pages masquées ni variables étrangères",
      async () => {
        const space = (await store.getSpace(fixture.spaces[0].id))!;
        const hidden = await store.createDocument({
          spaceId: space.id,
          title: "Secret parent",
          kind: "category",
        });
        await store.updateDocument(hidden.id, { hidden: true });
        await store.createDocument({
          spaceId: space.id,
          parentId: hidden.id,
          title: "Enfant secret",
        });
        await store.publishSpace(space.id);
        const published = (await store.getSpace(space.id))!;
        const publicData = publicPortalData(
          published,
          [{ id: "x", orgId: "x", key: "unrelated", value: "SECRET_VARIABLE" }],
          space.defaultLocale,
        );
        const serialized = JSON.stringify(publicData);
        assert.ok(!serialized.includes("Enfant secret"));
        assert.ok(!serialized.includes("Secret parent"));
        assert.ok(!serialized.includes("SECRET_VARIABLE"));
        assert.ok(!serialized.includes("apiKey"));
        assert.ok(!serialized.includes("accessPassword"));
        assert.ok(!serialized.includes("private-key-never-in-client"));
        if (published.accessPassword)
          assert.ok(!serialized.includes(published.accessPassword));
      },
    );
    await t.test(
      "arborescence cohérente, révisions et restauration",
      async () => {
        const doc = await store.createDocument({
          spaceId: fixture.spaces[0].id,
          title: "Original",
        });
        await assert.rejects(
          store.reorderDocuments(doc.spaceId, [doc.id], doc.id),
        );
        assert.equal((await store.getDocument(doc.id))!.parentId, null);
        await store.saveDocumentContent(
          doc.id,
          {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Modification" }],
              },
            ],
          },
          "Modifié",
        );
        await assert.rejects(
          store.saveDocumentContent(
            doc.id,
            { type: "doc" },
            undefined,
            doc.updatedAt,
          ),
          /Conflit/,
        );
        const revision = (await store.listRevisions(doc.id))[0];
        await store.restoreRevision(doc.id, revision.id);
        assert.equal((await store.getDocument(doc.id))!.title, "Original");
        assert.ok(
          database().prepare("SELECT 1 FROM state_backups LIMIT 1").get(),
        );
        const count = (
          database().prepare("SELECT count(*) n FROM state_backups").get() as {
            n: number;
          }
        ).n;
        assert.ok(count <= 20);
      },
    );
    await t.test("comptes et mots de passe robustes", () => {
      const hash = hashPassword("a-long-and-good-password");
      assert.ok(verifyPassword("a-long-and-good-password", hash));
      assert.ok(!verifyPassword("incorrect", hash));
      createUser(
        {
          email: "admin@example.org",
          name: "Admin",
          password: "long-password-123",
          role: "admin",
        },
        true,
      );
      assert.throws(() =>
        createUser(
          {
            email: "other@example.org",
            name: "Other",
            password: "long-password-123",
            role: "admin",
          },
          true,
        ),
      );
      assert.ok(login("admin@example.org", "long-password-123"));
      assert.equal(login("admin@example.org", "wrong"), null);
    });
    await t.test(
      "blocage des destinations internes et des protocoles dangereux",
      async () => {
        for (const ip of [
          "127.0.0.1",
          "10.0.0.1",
          "169.254.169.254",
          "192.168.1.1",
          "::1",
          "::ffff:127.0.0.1",
        ])
          assert.equal(publicAddress(ip), false, ip);
        for (const url of [
          "file:///etc/passwd",
          "http://127.0.0.1",
          "http://[::1]",
          "https://user:pass@example.com",
          "https://example.com:8080",
        ])
          assert.throws(() => validateOutboundUrl(url), url);
        assert.ok(publicAddress("1.1.1.1"));
        await assert.rejects(safeFetch("http://127.0.0.1"));
      },
    );
    await t.test("OpenAPI YAML : paramètres, réponses et schémas", () => {
      const pages = openApiPages(
        `openapi: 3.0.3\ninfo:\n  title: Example\npaths:\n  /items:\n    parameters:\n      - name: id\n        in: query\n        schema:\n          type: string\n    get:\n      summary: List items\n      responses:\n        '200':\n          description: OK\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/Item'\ncomponents:\n  schemas:\n    Item:\n      type: object\n      properties:\n        name:\n          type: string\n`,
        "https://example.org/spec.yaml",
      );
      assert.equal(pages.length, 2);
      assert.match(pages[1].markdown, /Paramètres/);
      assert.match(pages[1].markdown, /Schéma Item/);
      assert.match(pages[1].markdown, /200/);
      assert.throws(() => openApiPages("not: openapi", "https://example.org"));
    });
    await t.test("imports GitLab paginés et sous-pages Notion", async () => {
      const { gitlabFiles, notionFiles } =
        await import("../src/lib/remote-imports");
      const { createServer } = await import("node:http");
      const fixtureServer = createServer((request, response) => {
        const url = new URL(request.url!, "http://localhost");
        if (url.pathname.endsWith("/repository/tree")) {
          const page = url.searchParams.get("page");
          response.setHeader("Content-Type", "application/json");
          response.setHeader("x-next-page", page === "1" ? "2" : "");
          response.end(
            JSON.stringify([
              {
                type: "blob",
                path: page === "1" ? "docs/one.md" : "docs/two.md",
              },
            ]),
          );
        } else {
          response.end("# Document importé\n\nTexte du dépôt.");
        }
      });
      await new Promise<void>((resolve) =>
        fixtureServer.listen(0, "127.0.0.1", resolve),
      );
      const address = fixtureServer.address() as { port: number };
      const previous = process.env.DOCUMENTALIST_PRIVATE_HOSTS;
      process.env.DOCUMENTALIST_PRIVATE_HOSTS = "127.0.0.1";
      try {
        const imported = await gitlabFiles({
          host: `http://127.0.0.1:${address.port}`,
          repository: "group/project",
          branch: "main",
          path: "docs",
          token: "fixture",
        });
        assert.equal(imported.files.length, 2);
        assert.match(imported.files[0].content, /Texte du dépôt/);
      } finally {
        if (previous === undefined)
          delete process.env.DOCUMENTALIST_PRIVATE_HOSTS;
        else process.env.DOCUMENTALIST_PRIVATE_HOSTS = previous;
        await new Promise<void>((resolve) =>
          fixtureServer.close(() => resolve()),
        );
      }
      const root = "0".repeat(32);
      const child = "1".repeat(32);
      const notion = await notionFiles("fixture", root, async (input) => {
        const data = input.includes(`/pages/${root}`)
          ? {
              properties: {
                title: { type: "title", title: [{ plain_text: "Racine" }] },
              },
            }
          : input.includes(`/blocks/${root}/`)
            ? {
                results: [
                  {
                    id: child,
                    type: "child_page",
                    child_page: { title: "Sous-page" },
                  },
                  {
                    id: "paragraph",
                    type: "paragraph",
                    paragraph: { rich_text: [{ plain_text: "Texte racine" }] },
                  },
                ],
                has_more: false,
              }
            : {
                results: [
                  {
                    id: "child-text",
                    type: "paragraph",
                    paragraph: { rich_text: [{ plain_text: "Texte enfant" }] },
                  },
                ],
                has_more: false,
              };
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      });
      assert.equal(notion.files.length, 2);
      assert.ok(notion.files.some((f) => f.content.includes("Texte enfant")));
      assert.equal(notion.warnings.length, 0);
    });
  } finally {
    database().close();
    await rm(dir, { recursive: true, force: true });
  }
});
