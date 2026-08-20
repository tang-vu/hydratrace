#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import path from "node:path";
import { indexRepository } from "../core/indexer";
import { saveIndexCache } from "../core/indexer/cache";
import { runAnalysis } from "../core/service";
import { HydraDbClient } from "../hydradb/client";
import { loadHydraConfig, publicHydraConfig } from "../hydradb/config";
import { ingestRepository } from "../hydradb/ingest";

const HELP = `HydraTrace — see the blast radius before your coding agent edits.

Usage:
  hydratrace doctor [repo] [--json]
  hydratrace index <repo> [--json]
  hydratrace analyze <repo> [--task <text>] [--base <ref>] [--head <ref>]
                    [--budget 4000] [--depth 3] [--json]
  hydratrace benchmark
  hydratrace demo

Examples:
  pnpm cli doctor fixtures/shopflow
  pnpm cli index fixtures/shopflow
  pnpm cli analyze fixtures/shopflow --task "Change applyCoupon" --budget 4000
`;

function commandAvailable(command: string, args: string[]): { ok: boolean; detail: string } {
  const executable = process.platform === "win32" && command === "docker" ? (process.env.ComSpec ?? "cmd.exe") : command;
  const finalArgs = process.platform === "win32" && command === "docker" ? ["/d", "/s", "/c", "docker.cmd", ...args] : args;
  try { return { ok: true, detail: execFileSync(executable, finalArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() }; }
  catch { return { ok: false, detail: "unavailable" }; }
}

function output(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "string") console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

async function doctor(repository: string, json: boolean): Promise<void> {
  const checks: Array<{ check: string; ok: boolean; detail: string }> = [];
  checks.push({ check: "Node", ok: Number(process.versions.node.split(".")[0]) >= 22, detail: process.version });
  const git = commandAvailable("git", ["--version"]);
  checks.push({ check: "Git", ...git });
  const docker = commandAvailable("docker", ["version", "--format", "{{.Server.Version}}"]);
  checks.push({ check: "Docker", ...docker });
  const target = path.resolve(repository);
  const commit = commandAvailable("git", ["-C", target, "rev-parse", "HEAD"]);
  checks.push({ check: "Target repository", ok: true, detail: target });
  checks.push({ check: "Current commit", ...commit });
  try {
    const config = loadHydraConfig();
    checks.push({ check: "HydraDB environment", ok: true, detail: JSON.stringify(publicHydraConfig(config)) });
    const client = new HydraDbClient(config);
    checks.push({ check: "HydraDB readiness", ok: await client.readiness(), detail: config.adminUrl });
    const count = await client.query("MATCH (n:Repository) RETURN count(*) AS repositoryCount", { queryId: "hydratrace-doctor-read", consistency: "causal" });
    const total = Number(count.rows[0]?.[0] ?? 0);
    checks.push({ check: "Authenticated query", ok: true, detail: `${total} indexed repository records; ${count.latencyMs} ms` });
  } catch (error) {
    checks.push({ check: "HydraDB authenticated query", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
  if (json) output({ ok: checks.every((check) => check.ok), checks }, true);
  else for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.check.padEnd(24)} ${check.detail}`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      verbose: { type: "boolean" },
      task: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      budget: { type: "string", default: "4000" },
      depth: { type: "string", default: "3" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (parsed.values.help || parsed.positionals.length === 0) { console.log(HELP); return; }
  const [command, repository = "."] = parsed.positionals;
  const json = parsed.values.json ?? false;
  if (command === "doctor") return doctor(repository, json);
  if (command === "index") {
    const config = loadHydraConfig();
    const client = new HydraDbClient(config);
    const index = await indexRepository(repository);
    const ingestion = await ingestRepository(client, index);
    const cache = await saveIndexCache(index);
    output({ repository: index.root, commit: index.indexedCommit, diagnostics: index.diagnostics, ingestion, cache }, json);
    return;
  }
  if (command === "analyze") {
    const result = await runAnalysis({
      repository,
      task: parsed.values.task ?? "",
      base: parsed.values.base,
      head: parsed.values.head,
      includeDiff: Boolean(parsed.values.base || parsed.values.head || !parsed.values.task),
      budget: Number(parsed.values.budget),
      depth: Number(parsed.values.depth),
    });
    if (json) output(result, true);
    else {
      console.log(`HydraTrace analyzed ${result.index.root}`);
      console.log(`Seeds: ${result.impact.seeds.length} · Recommendations: ${result.impact.recommendations.length} · High risk: ${result.impact.recommendations.filter((item) => item.risk === "High").length}`);
      console.log(`Graph: ${result.impact.graphCounts.nodes} nodes / ${result.impact.graphCounts.edges} edges · Context: ${result.contextPack.estimatedTokens}/${result.contextPack.analysis.budget} estimated tokens`);
      for (const item of result.impact.recommendations.slice(0, 12)) {
        console.log(`${item.risk.padEnd(6)} ${item.score.toFixed(3)}  ${item.path}${item.symbol ? `:${item.startLine} ${item.symbol}` : ""}`);
        console.log(`       ${item.evidenceText}`);
      }
      console.log("Artifacts: generated/latest/context-pack.md and generated/latest/analysis.json");
    }
    return;
  }
  if (command === "benchmark") {
    await import("../benchmark/index");
    return;
  }
  if (command === "demo") {
    await import("../../scripts/demo");
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => {
  const verbose = process.argv.includes("--verbose");
  console.error(verbose && error instanceof Error ? error.stack : error instanceof Error ? error.message : String(error));
  process.exit(1);
});
