import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

function browserPath(): string {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* try the next installed browser */ }
  }
  throw new Error("No Chromium-based browser is installed. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to run the browser verification.");
}

async function waitForServer(url: string, deadlineMs = 60_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes("HydraTrace")) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`HydraTrace did not start at ${url} within ${deadlineMs / 1_000} seconds.`);
}

const port = 3417;
const url = `http://127.0.0.1:${port}`;
const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk: Buffer) => { serverLog = `${serverLog}${chunk.toString()}`.slice(-8_000); });
server.stderr.on("data", (chunk: Buffer) => { serverLog = `${serverLog}${chunk.toString()}`.slice(-8_000); });

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await waitForServer(url);
  browser = await chromium.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByText("HydraDB connected", { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Analyze blast radius" }).click();
  await page.locator(".metrics-grid").waitFor({ timeout: 60_000 });
  await page.getByText("checkoutRoute", { exact: true }).first().waitFor();
  await page.getByText("83% / 17%", { exact: true }).waitFor();
  const screenshot = path.resolve("public", "hydratrace-demo.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  if (browserErrors.length > 0) throw new Error(`Browser console errors:\n${browserErrors.join("\n")}`);
  const size = statSync(screenshot).size;
  if (size < 100_000) throw new Error(`Screenshot looks incomplete (${size} bytes).`);
  console.log(JSON.stringify({
    ok: true,
    url,
    title: await page.title(),
    graphStatus: await page.getByText("HydraDB connected", { exact: true }).textContent(),
    screenshot,
    screenshotBytes: size,
    consoleErrors: browserErrors.length,
  }, null, 2));
} catch (error) {
  if (serverLog.trim()) console.error(`Next.js log:\n${serverLog.trim()}`);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

