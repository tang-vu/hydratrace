import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { lexicalSearch, taskSeeds } from "./baseline/lexical";
import { buildContextPack } from "./context/pack";
import { attachChangeSet, mapDiffToSeeds, readGitDiff } from "./diff/parser";
import { analyzeImpact } from "./impact/analyze";
import type { ChangeSeed } from "./impact/types";
import { saveIndexCache } from "./indexer/cache";
import { indexRepository } from "./indexer";
import { HydraDbClient } from "../hydradb/client";
import { loadHydraConfig, publicHydraConfig } from "../hydradb/config";
import { ingestRepository } from "../hydradb/ingest";

export interface AnalysisOptions {
  repository: string;
  task: string;
  base?: string;
  head?: string;
  budget?: number;
  depth?: number;
  includeDiff?: boolean;
  writeArtifacts?: boolean;
}

export async function runAnalysis(options: AnalysisOptions) {
  const budget = options.budget ?? 4_000;
  const depth = options.depth ?? 3;
  const config = loadHydraConfig();
  const client = new HydraDbClient(config);
  if (!(await client.readiness())) throw new Error("HydraDB is not ready. Run pnpm hydra:up && pnpm hydra:wait.");
  const index = await indexRepository(options.repository);
  const parsedDiff = options.includeDiff || options.base || options.head ? readGitDiff(index.root, options.base, options.head) : undefined;
  const diffSeeds = parsedDiff ? mapDiffToSeeds(index, parsedDiff) : [];
  if (parsedDiff) attachChangeSet(index, parsedDiff, diffSeeds, parsedDiff.baseRef ?? "HEAD", parsedDiff.headRef ?? "worktree");
  const ingestion = await ingestRepository(client, index);
  await saveIndexCache(index);
  const textSeeds = options.task.trim() ? taskSeeds(index, options.task, 5) : [];
  const seedsById = new Map<number, ChangeSeed>();
  for (const seed of textSeeds) seedsById.set(seed.node.id, seed);
  for (const seed of diffSeeds) seedsById.set(seed.node.id, seed);
  const seeds = [...seedsById.values()].sort((a, b) => (a.source === "diff" ? -1 : 1) - (b.source === "diff" ? -1 : 1) || b.confidence - a.confidence).slice(0, 5);
  const impact = await analyzeImpact(client, index, seeds, options.task, depth);
  const contextPack = await buildContextPack(index, impact, {
    task: options.task || "Git diff analysis",
    budget,
    namespace: config.namespace,
    graphId: config.graphId,
    diff: parsedDiff ? {
      baseRef: parsedDiff.baseRef ?? "HEAD",
      headRef: parsedDiff.headRef ?? "worktree",
      files: parsedDiff.files,
    } : undefined,
  });
  const baseline = lexicalSearch(index, options.task, 10);
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hydra: publicHydraConfig(config),
    index,
    ingestion,
    impact,
    contextPack,
    diff: parsedDiff,
    baseline: baseline.map((result) => ({ id: result.node.id, path: result.node.properties.path, symbol: result.node.properties.qualifiedName, score: result.score, reason: result.reason })),
  };
  if (options.writeArtifacts !== false) {
    const artifactDirectory = path.resolve("generated", "latest");
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(path.join(artifactDirectory, "analysis.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    await writeFile(path.join(artifactDirectory, "context-pack.md"), contextPack.markdown, "utf8");
  }
  return output;
}
