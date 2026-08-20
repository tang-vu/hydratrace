import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { runAnalysis } from "../src/core/service";

const result = await runAnalysis({
  repository: "fixtures/shopflow",
  task: "Change applyCoupon rounding behavior",
  budget: 4_000,
  depth: 3,
});
const recommendations = result.impact.recommendations;
const route = recommendations.find((item) => item.symbol === "checkoutRoute");
const structuralTest = recommendations.find((item) => item.isTest && item.evidence.relationships.length >= 2);
const nativeReceipt = result.impact.queryReceipts.find((item) => item.query.includes("algo.SSpaths"));

if (!route || route.evidence.relationships.length < 3) throw new Error("Demo verification did not find the three-hop checkoutRoute impact.");
if (!structuralTest) throw new Error("Demo verification did not find a multi-hop structural test.");
if (!nativeReceipt || nativeReceipt.resultCount < 1) throw new Error("Demo verification has no native HydraDB path receipt.");
if (result.contextPack.estimatedTokens > result.contextPack.analysis.budget) throw new Error("Context Pack exceeded its configured budget.");

const markdownPath = path.resolve("generated", "latest", "context-pack.md");
const jsonPath = path.resolve("generated", "latest", "analysis.json");
await Promise.all([access(markdownPath), access(jsonPath)]);
const markdown = await readFile(markdownPath, "utf8");
if (!markdown.includes("HydraTrace Context Pack")) throw new Error("Markdown export is incomplete.");

console.log(JSON.stringify({
  ok: true,
  graph: result.impact.graphCounts,
  seed: result.impact.seeds.map((seed) => seed.node.properties.name ?? seed.node.properties.path),
  multiHopProduction: { symbol: route.symbol, hops: route.evidence.relationships.length, evidence: route.evidenceText },
  structuralTest: { path: structuralTest.path, hops: structuralTest.evidence.relationships.length, evidence: structuralTest.evidenceText },
  context: { estimatedTokens: result.contextPack.estimatedTokens, budget: result.contextPack.analysis.budget, included: result.contextPack.items.length },
  nativeQuery: { queryId: nativeReceipt.queryId, paths: nativeReceipt.resultCount, latencyMs: nativeReceipt.latencyMs },
  exports: [markdownPath, jsonPath],
}, null, 2));

