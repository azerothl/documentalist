import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

test(
  "Parcours navigateur sur ordinateur et mobile",
  { timeout: 300_000 },
  async (t) => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "documentalist-browser-"),
    );
    const listener = createServer();
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((r) => listener.close(() => r()));
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
        env: {
          ...process.env,
          DOCUMENTALIST_DATA_DIR: directory,
          DOCUMENTALIST_URL: origin,
          DOCUMENTALIST_COOKIE_SECURE: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let logs = "";
    server.stdout.on("data", (s) => (logs += s));
    server.stderr.on("data", (s) => (logs += s));
    const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
    let closeBrowser: (() => Promise<void>) | undefined;
    try {
      const browser = await chromium.launch({
        headless: true,
        ...(process.platform === "win32" && existsSync(edge)
          ? { executablePath: edge }
          : {}),
      });
      closeBrowser = () => browser.close();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      t.afterEach(async () => {
        for (let i = 0; i < 3 && (await page.getByRole("dialog").count()); i++)
          await page.keyboard.press("Escape");
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let ready = false;
      for (let i = 0; i < 120; i++) {
        try {
          if ((await fetch(origin + "/setup")).ok) {
            ready = true;
            break;
          }
        } catch {}
        if (server.exitCode !== null) throw new Error(logs);
        await delay(250);
      }
      assert.ok(ready, logs);
      await t.test(
        "installation et connexion depuis les formulaires",
        async () => {
          await page.goto(origin + "/app");
          await page.waitForURL("**/setup");
          await page
            .getByLabel("Code d’installation")
            .fill(await readFile(path.join(directory, "setup-token"), "utf8"));
          await page
            .getByLabel("Nom", { exact: true })
            .fill("Administrateur de test");
          await page.getByLabel("Adresse e-mail").fill("browser@example.org");
          await page
            .getByLabel("Mot de passe", { exact: true })
            .fill("Browser-long-password-123");
          await page
            .getByRole("button", { name: "Créer le compte", exact: true })
            .click();
          await page.waitForURL("**/login");
          await page.getByLabel("Adresse e-mail").fill("browser@example.org");
          await page
            .getByLabel("Mot de passe", { exact: true })
            .fill("Browser-long-password-123");
          await page
            .getByRole("button", { name: "Se connecter", exact: true })
            .click();
          await page.waitForURL((url) => url.pathname === "/app");
          await page.locator('.doc-editor[contenteditable="true"]').waitFor();
        },
      );
      await t.test(
        "contexte documentaire et compte sur une seule ligne",
        async () => {
          for (const width of [1440, 1230]) {
            await page.setViewportSize({ width, height: 1000 });
            const header = page.getByRole("banner");
            const brand = await header
              .getByRole("link", { name: "Documentalist", exact: true })
              .boundingBox();
            const account = await header
              .getByRole("navigation", { name: "Compte", exact: true })
              .boundingBox();
            assert.ok(brand && account);
            assert.ok(
              Math.abs(
                brand.y + brand.height / 2 - (account.y + account.height / 2),
              ) < 6,
              `Le compte et Documentalist doivent être alignés à ${width}px.`,
            );
            assert.ok(
              await header.evaluate(
                (el) => el.getBoundingClientRect().height <= 110,
              ),
            );
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
      );
      await t.test(
        "fenêtres au clavier, fermeture et retour du focus",
        async () => {
          await page
            .getByRole("button", { name: "Paramètres", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Paramètres",
            exact: true,
          });
          await dialog.waitFor();
          for (let i = 0; i < 16; i++) {
            await page.keyboard.press("Tab");
            assert.ok(
              await dialog.evaluate((el) =>
                el.contains(document.activeElement),
              ),
              "Le focus doit rester dans les paramètres.",
            );
          }
          await page.keyboard.press("Escape");
          assert.equal(await page.getByRole("dialog").count(), 0);
          assert.equal(
            await page.evaluate(() => document.activeElement?.textContent),
            "Paramètres",
          );
          await page.getByRole("button", { name: "Plus", exact: true }).click();
          await page.keyboard.press("Escape");
          assert.equal(await page.locator("#document-actions").count(), 0);
        },
      );
      await t.test(
        "thèmes, contraste, préférences conservées et mode lecture",
        async () => {
          await mkdir("artifacts", { recursive: true });
          for (const theme of ["light", "dark", "contrast"]) {
            await page
              .getByRole("button", {
                name: "Apparence et lecture",
                exact: true,
              })
              .click();
            const dialog = page.getByRole("dialog", {
              name: "Apparence et lecture",
              exact: true,
            });
            await dialog
              .getByLabel("Thème", { exact: true })
              .selectOption(theme);
            await dialog
              .getByLabel("Taille du texte", { exact: true })
              .selectOption("18");
            await page.keyboard.press("Escape");
            assert.equal(
              await page.locator("html").getAttribute("data-theme"),
              theme,
            );
            assert.equal(
              await page
                .locator(".doc-editor")
                .evaluate((el) => getComputedStyle(el).fontSize),
              "18px",
            );
            const audit = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze();
            assert.deepEqual(
              audit.violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => n.target),
              })),
              [],
              `Accessibilité du thème ${theme}`,
            );
            await writeFile(
              `artifacts/accessibility-${theme}.json`,
              JSON.stringify(
                { violations: audit.violations, passes: audit.passes.length },
                null,
                2,
              ),
            );
            await page.screenshot({ path: `artifacts/workspace-${theme}.png` });
          }
          await page.reload();
          await page
            .getByLabel("Contenu du document", { exact: true })
            .waitFor();
          assert.equal(
            await page.locator("html").getAttribute("data-theme"),
            "contrast",
          );
          assert.equal(
            await page.locator("html").getAttribute("data-reading-size"),
            "18",
          );
          await page
            .getByRole("button", { name: "Apparence et lecture", exact: true })
            .click();
          let dialog = page.getByRole("dialog", {
            name: "Apparence et lecture",
            exact: true,
          });
          await dialog.getByRole("checkbox", { name: /^Mode lecture/ }).check();
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator('[contenteditable="true"]').count(),
            0,
          );
          await page
            .getByRole("button", {
              name: "Revenir à la rédaction",
              exact: true,
            })
            .click();
          await page
            .getByRole("button", { name: "Apparence et lecture", exact: true })
            .click();
          dialog = page.getByRole("dialog", {
            name: "Apparence et lecture",
            exact: true,
          });
          await dialog
            .getByLabel("Thème", { exact: true })
            .selectOption("system");
          await dialog
            .getByLabel("Taille du texte", { exact: true })
            .selectOption("16");
          await page.keyboard.press("Escape");
          await page.emulateMedia({ colorScheme: "dark" });
          await page.waitForFunction(
            () => document.documentElement.dataset.theme === "dark",
          );
          await page.emulateMedia({ colorScheme: "light" });
          await page.waitForFunction(
            () => document.documentElement.dataset.theme === "light",
          );
        },
      );
      await t.test(
        "liens directs et déplacement sans glisser-déposer",
        async () => {
          await page
            .getByRole("button", { name: "Core concepts", exact: true })
            .click();
          assert.equal(
            new URL(page.url()).searchParams.get("doc"),
            "doc_concepts",
          );
          await page.reload();
          assert.equal(
            await page
              .getByLabel("Titre du document", { exact: true })
              .inputValue(),
            "Core concepts",
          );
          await page.getByRole("button", { name: "Plus", exact: true }).click();
          await page
            .getByRole("button", { name: "Déplacer…", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Déplacer le document",
            exact: true,
          });
          await dialog
            .getByLabel("Destination", { exact: true })
            .selectOption("root");
          await dialog
            .getByRole("button", { name: "Déplacer", exact: true })
            .click();
          await dialog.waitFor({ state: "detached" });
          const data = await (
            await page.request.get(origin + "/api/documents/doc_concepts")
          ).json();
          assert.equal(data.document.parentId, null);
          await page
            .getByRole("button", { name: "Welcome", exact: true })
            .click();
        },
      );
      await t.test(
        "sauvegarde lors d’un changement de page et publication",
        async () => {
          await page
            .getByRole("button", { name: "Welcome", exact: true })
            .click();
          await page
            .locator('.doc-editor[contenteditable="true"]')
            .fill("Texte de la première page");
          await page
            .getByRole("button", { name: "Getting started", exact: true })
            .click();
          await page
            .locator('.doc-editor[contenteditable="true"]')
            .fill("Texte de la deuxième page");
          await page
            .getByText("Brouillon enregistré", { exact: true })
            .waitFor();
          const first = await page.request.get(
            origin + "/api/documents/doc_welcome",
          );
          assert.match(
            JSON.stringify(await first.json()),
            /Texte de la première page/,
          );
          const second = await page.request.get(
            origin + "/api/documents/doc_getting_started",
          );
          assert.match(
            JSON.stringify(await second.json()),
            /Texte de la deuxième page/,
          );
          await page
            .getByRole("button", { name: "Publier", exact: true })
            .click();
          await page
            .getByText("Version publiée à jour", { exact: true })
            .waitFor();
          await mkdir("artifacts", { recursive: true });
          await page.screenshot({ path: "artifacts/workspace-desktop.png" });
        },
      );
      await t.test(
        "panneaux mobiles, recherche vide et absence de débordement à 320 px",
        async () => {
          for (const width of [768, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `Débordement à ${width}px`,
            );
            await page
              .getByRole("button", { name: "Panneau de page", exact: true })
              .click();
            const dialog = page.getByRole("dialog", {
              name: "Panneau de page",
              exact: true,
            });
            await dialog.getByRole("tab", { name: /^Commentaires/ }).click();
            await dialog
              .getByLabel("Votre commentaire", { exact: true })
              .waitFor();
            await dialog.getByRole("tab", { name: "SEO", exact: true }).click();
            await dialog.getByLabel("Titre SEO", { exact: true }).waitFor();
            await dialog.getByRole("tab", { name: "IA", exact: true }).click();
            assert.equal(
              await dialog
                .getByRole("tab", { name: "IA", exact: true })
                .getAttribute("aria-selected"),
              "true",
            );
            await page.keyboard.press("Escape");
          }
          await page
            .getByRole("button", { name: "Documents", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Documents",
            exact: true,
          });
          await dialog
            .getByLabel("Rechercher dans cet espace", { exact: true })
            .fill("introuvable-zzzzz");
          await dialog
            .getByText("Aucun résultat pour « introuvable-zzzzz ».", {
              exact: true,
            })
            .waitFor();
          await dialog
            .getByLabel("Rechercher dans cet espace", { exact: true })
            .fill("");
          await dialog
            .getByRole("button", { name: "Core concepts", exact: true })
            .click();
          assert.equal(await page.getByRole("dialog").count(), 0);
          await page.screenshot({ path: "artifacts/workspace-mobile.png" });
          const audit = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          await writeFile(
            "artifacts/accessibility-mobile.json",
            JSON.stringify(
              { violations: audit.violations, passes: audit.passes.length },
              null,
              2,
            ),
          );
          assert.deepEqual(
            audit.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
            [],
          );
        },
      );
      let readingDocumentId = "";
      await t.test(
        "publication des encadrés et absence de titre répété",
        async () => {
          const title = "Reading guide";
          const created = await page.request.post(origin + "/api/documents", {
            headers: { Origin: origin },
            data: {
              spaceId: "spc_product",
              title,
              locale: "en",
              content: {
                type: "doc",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 1 },
                    content: [{ type: "text", text: title }],
                  },
                  ...["info", "warning", "success"].map((variant) => ({
                    type: "callout",
                    attrs: { variant },
                    content: [
                      {
                        type: "paragraph",
                        content: [
                          {
                            type: "text",
                            text: "Keep a backup before making changes.",
                          },
                        ],
                      },
                    ],
                  })),
                  {
                    type: "taskList",
                    content: [
                      {
                        type: "taskItem",
                        attrs: { checked: false },
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              { type: "text", text: "Review the document" },
                            ],
                          },
                        ],
                      },
                      {
                        type: "taskItem",
                        attrs: { checked: true },
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Backup ready" }],
                          },
                          {
                            type: "paragraph",
                            content: [
                              {
                                type: "text",
                                text: "Keep the backup for the next release.",
                              },
                            ],
                          },
                          {
                            type: "taskList",
                            content: [
                              {
                                type: "taskItem",
                                attrs: { checked: false },
                                content: [
                                  {
                                    type: "paragraph",
                                    content: [
                                      { type: "text", text: "Archive report" },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Next steps" }],
                  },
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Read the full documentation before publishing.",
                      },
                    ],
                  },
                ],
              },
            },
          });
          assert.ok(created.ok(), await created.text());
          readingDocumentId = (await created.json()).document.id;
          const published = await page.request.post(
            origin + "/api/spaces/spc_product/publish",
            { headers: { Origin: origin } },
          );
          assert.ok(published.ok());
          await page.goto(origin + "/p/product-docs/reading-guide?lang=en");
          assert.equal(
            await page
              .getByRole("heading", { name: title, exact: true })
              .count(),
            1,
          );
          assert.deepEqual(
            await page.locator(".doc-callout-label").allTextContents(),
            ["Information", "Attention", "Succès"],
          );
          assert.equal(
            await page
              .getByRole("checkbox", {
                name: "Review the document",
                exact: true,
              })
              .isChecked(),
            false,
          );
          assert.equal(
            await page
              .getByRole("checkbox", { name: "Backup ready", exact: true })
              .isChecked(),
            true,
          );
          assert.equal(
            await page
              .getByRole("checkbox", { name: "Backup ready", exact: true })
              .isDisabled(),
            true,
          );
          assert.equal(
            await page
              .getByRole("checkbox", { name: "Archive report", exact: true })
              .isChecked(),
            false,
          );
          assert.equal(
            await page
              .getByText("Keep the backup for the next release.", {
                exact: true,
              })
              .count(),
            1,
          );
          const tasks = await page.getByRole("checkbox").evaluateAll((inputs) =>
            inputs.map((input) => ({
              id: input.id,
              labels: (input as HTMLInputElement).labels?.length,
            })),
          );
          assert.equal(new Set(tasks.map((task) => task.id)).size, 3);
          assert.ok(tasks.every((task) => task.labels === 1));
          await page
            .getByRole("navigation", {
              name: "Pages précédente et suivante",
              exact: true,
            })
            .getByRole("link", { name: /^Page précédente : / })
            .waitFor();
          assert.equal(
            await page.locator("article").getAttribute("lang"),
            "en",
          );
          const audit = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          assert.deepEqual(
            audit.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
            [],
          );
        },
      );
      await t.test(
        "menu mobile, recherche sans résultat et page de lecture",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(origin + "/p/product-docs");
          await page
            .getByRole("button", { name: "Documents", exact: true })
            .click();
          await page
            .locator("#portal-mobile-navigation")
            .getByRole("link", { name: "Getting started", exact: true })
            .waitFor();
          await page.keyboard.press("Escape");
          await page
            .getByLabel("Rechercher dans la documentation")
            .fill("introuvable-zzzzz");
          await page.getByRole("status").waitFor();
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            "Le portail ne doit pas déborder horizontalement.",
          );
          await page.screenshot({
            path: "artifacts/portal-mobile.png",
            fullPage: true,
          });
          assert.equal(
            await page.locator('[contenteditable="true"]').count(),
            0,
          );
        },
      );
      await t.test(
        "compte lecteur : recherche, navigation et liens directs sans éditeur",
        async () => {
          const created = await page.request.post(origin + "/api/admin/team", {
            headers: { Origin: origin },
            data: {
              email: "reader@example.org",
              name: "Lecteur de test",
              password: "Reader-long-password-123",
              role: "viewer",
            },
          });
          assert.ok(created.ok());
          const reader = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
          });
          try {
            await reader.request.post(origin + "/api/auth/login", {
              headers: { Origin: origin },
              data: {
                email: "reader@example.org",
                password: "Reader-long-password-123",
              },
            });
            const rp = await reader.newPage();
            await rp.goto(
              `${origin}/app?space=spc_product&doc=${readingDocumentId}&lang=en`,
            );
            await rp
              .getByRole("heading", { name: "Reading guide", exact: true })
              .waitFor();
            assert.equal(
              await rp.locator('[contenteditable="true"]').count(),
              0,
            );
            assert.equal(
              await rp
                .getByRole("button", { name: "Publier", exact: true })
                .count(),
              0,
            );
            await rp
              .getByLabel("Rechercher dans la documentation", { exact: true })
              .fill("backup");
            await rp
              .getByRole("region", {
                name: "Résultats de recherche",
                exact: true,
              })
              .getByRole("link", { name: /Reading guide/ })
              .click();
            assert.equal(
              new URL(rp.url()).searchParams.get("doc"),
              readingDocumentId,
            );
            await rp.screenshot({ path: "artifacts/reader-desktop.png" });
          } finally {
            await reader.close();
          }
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      await closeBrowser?.();
      server.kill();
      await new Promise<void>((resolve) => {
        if (server.exitCode !== null) resolve();
        else server.once("exit", () => resolve());
      });
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
);
