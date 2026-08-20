import { runAnalysis } from "../src/core/service";

const task = "Change HydraDbClient query retry and bookmark behavior";
const result = await runAnalysis({ repository: ".", task, budget: 4_000, depth: 3, writeArtifacts: false });
const seedIds = new Set(result.impact.seeds.map((seed) => seed.node.id));
const impacted = result.impact.recommendations.filter((item) => !seedIds.has(item.node.id));
const expectedPaths = [
  "src/app/api/status/route.ts",
  "src/cli/index.ts",
  "src/core/impact/analyze.ts",
  "src/hydradb/ingest.ts",
  "tests/hydradb-client.test.ts",
];
const discovered = new Set(result.impact.recommendations.map((item) => item.path));

if (!result.impact.seeds.some((seed) => seed.node.properties.qualifiedName === "HydraDbClient.query")) {
  throw new Error("Dogfood analysis did not resolve HydraDbClient.query as a seed.");
}
if (expectedPaths.some((path) => !discovered.has(path))) {
  throw new Error(`Dogfood analysis missed expected structural paths: ${expectedPaths.filter((path) => !discovered.has(path)).join(", ")}`);
}
if (impacted.length === 0 || impacted.some((item) => item.evidence.relationships.length === 0)) {
  throw new Error("Dogfood analysis returned an impacted recommendation without an evidence relationship.");
}
if (result.contextPack.estimatedTokens > result.contextPack.analysis.budget) {
  throw new Error("Dogfood Context Pack exceeded its token budget.");
}

console.log(`PASS  HydraTrace indexed itself: ${result.impact.graphCounts.nodes} nodes / ${result.impact.graphCounts.edges} edges`);
console.log(`PASS  ${result.impact.recommendations.length} recommendations; ${expectedPaths.length} critical consumers verified`);
console.log(`PASS  ${new Set(result.impact.recommendations.filter((item) => item.isTest).map((item) => item.path)).size} structural test files found`);
console.log(`PASS  Context Pack ${result.contextPack.estimatedTokens}/${result.contextPack.analysis.budget} estimated tokens`);
