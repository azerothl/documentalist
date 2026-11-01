import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

test(
  "Parcours navigateur sur ordinateur et mobile",
  { timeout: 180_000 },
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
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
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
          await page.waitForURL("**/app");
          await page.locator('.doc-editor[contenteditable="true"]').waitFor();
        },
      );
      await t.test(
        "sauvegarde lors d’un changement de page et publication",
        async () => {
          await page
            .locator('.doc-editor[contenteditable="true"]')
            .fill("Texte de la première page");
          await page
            .getByRole("button", { name: "Getting started", exact: true })
            .click();
          await page
            .locator('.doc-editor[contenteditable="true"]')
            .fill("Texte de la deuxième page");
          await page.getByText("Enregistré", { exact: true }).waitFor();
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
          await page.getByText("À jour", { exact: true }).waitFor();
          await mkdir("artifacts", { recursive: true });
          await page.screenshot({ path: "artifacts/workspace-desktop.png" });
        },
      );
      await t.test(
        "menu mobile, recherche sans résultat et page de lecture",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(origin + "/p/product-docs");
          await page
            .getByRole("button", { name: "Sommaire", exact: true })
            .click();
          await page
            .locator("#portal-navigation")
            .getByRole("link", { name: "Getting started", exact: true })
            .waitFor();
          await page
            .getByRole("button", { name: "Sommaire", exact: true })
            .click();
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
