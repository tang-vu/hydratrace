import { accessSync, constants } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, type Page } from "playwright-core";

const outputRoot = path.resolve("generated", "video");
const stillRoot = path.join(outputRoot, "stills");
const baseUrl = process.env.HYDRATRACE_VIDEO_URL ?? "http://127.0.0.1:3418";

function browserPath(): string {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  throw new Error("No Chromium browser found for video capture.");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function card(title: string, subtitle: string, footer: string): string {
  return `<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#070b0d;color:#eef7f5;font-family:Inter,Segoe UI,Arial,sans-serif}
    body:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 70% 25%,rgba(51,231,190,.11),transparent 34%),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:auto,48px 48px,48px 48px}
    .wrap{position:relative;height:100%;padding:105px 126px;display:flex;flex-direction:column;justify-content:center}.mark{display:flex;gap:9px;margin-bottom:34px}.mark i{display:block;width:13px;height:54px;border-radius:9px;background:#31e6bd;transform:rotate(24deg);box-shadow:0 0 28px rgba(49,230,189,.2)}.mark i:nth-child(2){height:78px;margin-top:-12px}.mark i:nth-child(3){height:42px;margin-top:7px}
    .eyebrow{font:700 20px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.18em;color:#6fe8ce;margin-bottom:23px}h1{font-size:92px;line-height:.98;letter-spacing:-.055em;max-width:1320px;margin:0 0 34px}h1 span{color:#31e6bd}.sub{font-size:30px;line-height:1.45;color:#9eb2b0;max-width:1100px}.footer{position:absolute;left:126px;right:126px;bottom:78px;border-top:1px solid #1e3032;padding-top:24px;display:flex;justify-content:space-between;color:#718785;font:600 18px ui-monospace,Consolas,monospace}.live{color:#31e6bd}
  </style></head><body><div class="wrap"><div class="mark"><i></i><i></i><i></i></div><div class="eyebrow">GRAPH-NATIVE CHANGE INTELLIGENCE</div><h1>${title}</h1><div class="sub">${subtitle}</div><div class="footer"><span>${footer}</span><span class="live">hydratrace.tangvu.dev</span></div></div></body></html>`;
}

async function screenshot(page: Page, filename: string): Promise<void> {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(stillRoot, filename), type: "png", animations: "disabled" });
}

await mkdir(stillRoot, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: "dark" });
const errors: string[] = [];

try {
  const titlePage = await context.newPage();
  await titlePage.setContent(card("See the blast radius<br><span>before the edit.</span>", "Evidence-backed change impact and token-budgeted context for coding agents.", "HACK HYDRA 2026 · CODE GRAPHS FOR IDE ASSISTANTS"));
  await screenshot(titlePage, "00-title.png");

  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.getByText("HydraDB connected", { exact: true }).waitFor({ timeout: 20_000 });
  await screenshot(page, "01-hero.png");

  await page.getByRole("button", { name: "Analyze blast radius" }).click();
  await page.getByText("Traversing HydraDB", { exact: true }).waitFor({ timeout: 5_000 });
  await screenshot(page, "02-loading.png");
  await page.locator(".metrics-grid").waitFor({ timeout: 90_000 });
  await page.getByText("83% / 17%", { exact: true }).waitFor({ timeout: 10_000 });
  await page.locator(".metrics-grid").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -82));
  await screenshot(page, "03-overview.png");

  await page.getByRole("button").filter({ hasText: "calculateOrderTotal" }).first().click();
  await screenshot(page, "04-caller.png");

  await page.getByText("checkoutRoute", { exact: true }).first().click();
  await screenshot(page, "05-route.png");

  await page.getByRole("button").filter({ hasText: "totalsCannotBecomeNegative" }).first().click();
  await screenshot(page, "06-test.png");

  await page.locator(".detail-grid").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -65));
  await screenshot(page, "07-details.png");

  await page.locator(".proof-panel").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -110));
  await screenshot(page, "08-proof.png");

  const tsxCli = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
  const mcp = spawnSync(process.execPath, [tsxCli, "scripts/mcp-verify.ts"], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });
  if (mcp.status !== 0) throw new Error(`MCP verification failed during capture: ${mcp.error?.message || mcp.stderr || mcp.stdout || "unknown process failure"}`);
  const terminalLines = `${mcp.stdout}\n${mcp.stderr}`.split(/\r?\n/).filter((line) => line.startsWith("PASS"));
  if (terminalLines.length < 5) throw new Error("MCP verification output was incomplete.");

  const terminalPage = await context.newPage();
  await terminalPage.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;background:#070b0d;color:#dce9e7;font-family:Inter,Segoe UI,Arial,sans-serif;padding:86px 108px}.eyebrow{color:#50e9c6;font:700 18px ui-monospace,Consolas,monospace;letter-spacing:.16em;margin-bottom:22px}h1{font-size:62px;margin:0 0 42px;letter-spacing:-.04em}.terminal{background:#0b1114;border:1px solid #23383a;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.34)}.bar{height:54px;background:#111a1e;border-bottom:1px solid #23383a;display:flex;align-items:center;gap:9px;padding:0 22px}.dot{width:12px;height:12px;border-radius:50%;background:#314246}.dot:first-child{background:#ff6b6b}.dot:nth-child(2){background:#ffd166}.dot:nth-child(3){background:#31e6bd}.path{margin-left:14px;color:#6f8987;font:15px ui-monospace,Consolas,monospace}.content{padding:38px 42px 45px;font:23px/1.75 ui-monospace,Consolas,monospace}.prompt{color:#50e9c6;margin-bottom:22px}.pass{color:#a8bbb9}.pass b{color:#31e6bd}.foot{margin-top:36px;color:#718785;font-size:21px}
  </style></head><body><div class="eyebrow">AGENT INTEGRATION</div><h1>Real MCP handshake. Same graph evidence.</h1><div class="terminal"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="path">hydratrace · verified local runtime</span></div><div class="content"><div class="prompt">$ pnpm mcp:verify</div>${terminalLines.map((line) => `<div class="pass"><b>PASS</b>${escapeHtml(line.slice(4))}</div>`).join("")}<div class="foot">No mock transport · No fallback graph · HydraDB required</div></div></div></body></html>`);
  await screenshot(terminalPage, "09-mcp.png");

  const closePage = await context.newPage();
  await closePage.setContent(card("Less context.<br><span>The right context.</span>", "Every recommendation carries a graph path that proves why it matters.", "HYDRADB · TYPESCRIPT · CONTEXT PACK · MCP"));
  await screenshot(closePage, "10-close.png");

  if (errors.length > 0) throw new Error(`Browser console errors during capture:\n${errors.join("\n")}`);
  const metrics = await page.locator(".metrics-grid").innerText();
  await writeFile(path.join(outputRoot, "capture.json"), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    sourceUrl: baseUrl,
    metrics,
    mcp: terminalLines,
    browserErrors: errors,
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, sourceUrl: baseUrl, stills: 11, browserErrors: errors.length, output: stillRoot }, null, 2));
} finally {
  await browser.close();
}
