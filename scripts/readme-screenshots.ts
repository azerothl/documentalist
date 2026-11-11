/**
 * Captures du README : `npm run build`, puis `npm run docs:screenshots`.
 *
 * Lance la version compilée sur un port libre avec un dossier de données
 * temporaire (espaces d'exemple Product docs et API docs), crée un compte
 * administrateur jetable pour l'espace de rédaction, enregistre les images
 * dans docs/screenshots/ puis supprime les données.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { APPEARANCE_KEY } from "../src/lib/appearance";

const OUT = path.resolve("docs/screenshots");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function freePort() {
  const listener = createServer();
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  const { port } = listener.address() as { port: number };
  await new Promise<void>((r) => listener.close(() => r()));
  return port;
}

async function openPage(
  browser: Browser,
  theme: "light" | "dark",
  viewport = DESKTOP,
  deviceScaleFactor = 1,
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: "fr-FR",
  });
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [APPEARANCE_KEY, JSON.stringify({ theme })] as const,
  );
  return context.newPage();
}

async function shoot(page: Page, url: string, file: string) {
  await page.goto(url, { waitUntil: "networkidle" });
  await settle(page);
  await page.screenshot({ path: path.join(OUT, file) });
  console.log(`docs/screenshots/${file}`);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await delay(300);
}

async function main() {
  if (!existsSync(".next/BUILD_ID"))
    throw new Error("Lancer d'abord npm run build.");
  await mkdir(OUT, { recursive: true });
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "documentalist-readme-"),
  );
  const port = await freePort();
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
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" && existsSync(edge)
      ? { executablePath: edge }
      : {}),
  });
  try {
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      try {
        ready = (await fetch(origin + "/setup")).ok;
      } catch {}
      if (server.exitCode !== null) throw new Error(logs);
      if (!ready) await delay(250);
    }
    if (!ready) throw new Error(logs);

    // Portail et accueil
    const light = await openPage(browser, "light");
    await shoot(light, origin + "/", "accueil.png");
    await shoot(
      light,
      origin + "/p/product-docs/reference?lang=fr",
      "portail-reference.png",
    );
    await light.getByRole("button", { name: "Rechercher", exact: true }).click();
    await light
      .getByLabel("Rechercher dans la documentation", { exact: true })
      .fill("github");
    await light.getByRole("status").waitFor();
    await settle(light);
    await light.screenshot({ path: path.join(OUT, "recherche.png") });
    console.log("docs/screenshots/recherche.png");
    await shoot(light, origin + "/p/api-docs?lang=en", "portail-code.png");

    const dark = await openPage(browser, "dark");
    await shoot(
      dark,
      origin + "/p/product-docs/learn/write-and-review?lang=fr",
      "portail-sombre.png",
    );

    const mobile = await openPage(browser, "light", MOBILE, 2);
    await shoot(
      mobile,
      origin + "/p/product-docs/reference/getting-started?lang=fr",
      "portail-mobile.png",
    );
    await mobile.getByRole("button", { name: "Documents", exact: true }).click();
    await mobile.locator("#portal-mobile-navigation").waitFor();
    await settle(mobile);
    await mobile.screenshot({ path: path.join(OUT, "portail-mobile-menu.png") });
    console.log("docs/screenshots/portail-mobile-menu.png");

    // Espace de rédaction : compte administrateur jetable, supprimé avec
    // le dossier de données.
    const email = "readme@example.org";
    const password = `Readme-${randomBytes(12).toString("hex")}`;
    const editor = await openPage(browser, "light");
    await editor.goto(origin + "/app");
    await editor.waitForURL("**/setup");
    await editor
      .getByLabel("Code d’installation")
      .fill(await readFile(path.join(directory, "setup-token"), "utf8"));
    await editor.getByLabel("Nom", { exact: true }).fill("Équipe documentation");
    await editor.getByLabel("Adresse e-mail").fill(email);
    await editor.getByLabel("Mot de passe", { exact: true }).fill(password);
    await editor
      .getByRole("button", { name: "Créer le compte", exact: true })
      .click();
    await editor.waitForURL("**/login");
    await editor.getByLabel("Adresse e-mail").fill(email);
    await editor.getByLabel("Mot de passe", { exact: true }).fill(password);
    await editor
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await editor.waitForURL((url) => url.pathname === "/app");
    await editor.locator('.doc-editor[contenteditable="true"]').waitFor();
    await settle(editor);
    await editor.screenshot({ path: path.join(OUT, "espace-redaction.png") });
    console.log("docs/screenshots/espace-redaction.png");
  } finally {
    await browser.close();
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
