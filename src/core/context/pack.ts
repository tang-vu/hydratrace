import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { ChangedFile } from "../diff/parser";
import type { IndexedRepository } from "../graph/model";
import type { ImpactAnalysis, ImpactRecommendation } from "../impact/types";
import { assertInsideRoot } from "../indexer/discovery";

export interface ContextItem {
  nodeId: number;
  path: string;
  symbol?: string;
  startLine: number;
  endLine: number;
  snippet: string;
  why: string;
  evidencePath: string;
  risk: string;
  estimatedTokens: number;
}

export interface ContextDiff {
  baseRef: string;
  headRef: string;
  files: ChangedFile[];
}

export interface ContextPack {
  schemaVersion: 1;
  generatedAt: string;
  repository: { root: string; commit: string };
  analysis: {
    task: string;
    depth: number;
    budget: number;
    namespace: string;
    graphId: string;
    diff?: ContextDiff;
  };
  seeds: Array<{ id: number; path: string; symbol?: string; source: string; confidence: number; reason: string }>;
  diffHunks: { included: number; total: number };
  items: ContextItem[];
  omitted: Array<{ id: number; path: string; reason: string }>;
  estimatedTokens: number;
  budgetUtilization: number;
  markdown: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function snippetFor(root: string, recommendation: ImpactRecommendation): Promise<Omit<ContextItem, "estimatedTokens"> | undefined> {
  if (!recommendation.path) return undefined;
  const requested = path.resolve(root, recommendation.path);
  assertInsideRoot(root, requested);
  let canonical: string;
  try { canonical = await realpath(requested); } catch { return undefined; }
  assertInsideRoot(await realpath(root), canonical);
  const content = await readFile(canonical, "utf8");
  const lines = content.split(/\r?\n/);
  const startLine = Math.max(1, recommendation.startLine ?? 1);
  const declaredEnd = recommendation.endLine ?? Math.min(lines.length, 30);
  const endLine = Math.min(lines.length, startLine + 59, declaredEnd);
  const snippet = lines.slice(startLine - 1, endLine).join("\n");
  return {
    nodeId: recommendation.node.id,
    path: recommendation.path,
    symbol: recommendation.symbol,
    startLine,
    endLine,
    snippet,
    why: recommendation.reason,
    evidencePath: recommendation.evidenceText,
    risk: recommendation.risk,
  };
}

function itemMarkdown(item: ContextItem): string {
  return [
    `### ${item.path}:${item.startLine}${item.symbol ? ` - ${item.symbol}` : ""}`,
    "",
    `Risk: **${item.risk}** | Estimated tokens: ${item.estimatedTokens}`,
    "",
    `Why: ${item.why}`,
    "",
    `Evidence: \`${item.evidencePath}\``,
    "",
    "```ts",
    item.snippet,
    "```",
  ].join("\n");
}

function hunkMarkdown(file: ChangedFile, hunk: ChangedFile["hunks"][number]): string {
  const displayPath = file.oldPath && file.oldPath !== file.path ? `${file.oldPath} -> ${file.path}` : file.path;
  return [
    `### ${file.status}: ${displayPath}`,
    "",
    "```diff",
    hunk.header,
    ...hunk.lines.slice(0, 30).map((line) => line.slice(0, 240)),
    "```",
  ].join("\n");
}

export async function buildContextPack(
  index: IndexedRepository,
  impact: ImpactAnalysis,
  options: { task: string; budget: number; namespace: string; graphId: string; diff?: ContextDiff },
): Promise<ContextPack> {
  if (!Number.isInteger(options.budget) || options.budget < 400 || options.budget > 32_000) {
    throw new Error("Context budget must be an integer from 400 to 32,000 estimated tokens.");
  }
  const generatedAt = new Date().toISOString();
  const seedIds = new Set(impact.seeds.map((seed) => seed.node.id));
  const ordered = [...impact.recommendations].sort((a, b) => {
    const aTier = seedIds.has(a.node.id) ? 0 : a.evidence.relationships.length === 1 ? 1 : a.isTest ? 2 : 3;
    const bTier = seedIds.has(b.node.id) ? 0 : b.evidence.relationships.length === 1 ? 1 : b.isTest ? 2 : 3;
    return aTier - bTier || b.score - a.score || a.node.id - b.node.id;
  });
  const hunkCandidates = (options.diff?.files ?? []).flatMap((file) => file.hunks.map((hunk) => hunkMarkdown(file, hunk)));
  const selectedHunks: string[] = [];
  const items: ContextItem[] = [];
  const omitted: ContextPack["omitted"] = [];
  const seenRanges = new Set<string>();
  let used = 180;

  for (const hunk of hunkCandidates) {
    const cost = estimateTokens(hunk);
    if (used + cost <= options.budget) {
      selectedHunks.push(hunk);
      used += cost;
    }
  }
  for (const recommendation of ordered) {
    const raw = await snippetFor(index.root, recommendation);
    if (!raw) {
      omitted.push({ id: recommendation.node.id, path: recommendation.path, reason: "Source is unavailable (for example, a deleted file)." });
      continue;
    }
    const rangeKey = `${raw.path}:${raw.startLine}:${raw.endLine}`;
    if (seenRanges.has(rangeKey)) continue;
    seenRanges.add(rangeKey);
    const estimatedTokens = estimateTokens(itemMarkdown({ ...raw, estimatedTokens: 0 }));
    if (used + estimatedTokens > options.budget) {
      omitted.push({ id: recommendation.node.id, path: recommendation.path, reason: "Token budget exhausted." });
      continue;
    }
    used += estimatedTokens;
    items.push({ ...raw, estimatedTokens });
  }

  const render = () => {
    const seedLines = impact.seeds.map((seed) => {
      const symbol = seed.node.label === "Symbol" ? `:${String(seed.node.properties.startLine ?? "?")} (${String(seed.node.properties.qualifiedName)})` : "";
      return `  - ${String(seed.node.properties.path ?? "unknown")}${symbol} [${seed.source}, ${seed.confidence.toFixed(2)}] - ${seed.reason.slice(0, 180)}`;
    });
    const header = [
      "# HydraTrace Context Pack",
      "",
      `- Task: ${options.task}`,
      `- Repository commit: ${index.indexedCommit}`,
      `- Generated: ${generatedAt}`,
      `- HydraDB scope: ${options.namespace}/${options.graphId}`,
      `- Graph depth: ${impact.depth}`,
      `- Budget: ${options.budget} estimated tokens`,
      `- Included context: ${items.length}; omitted context: ${omitted.length}`,
      `- Diff hunks: ${selectedHunks.length}/${hunkCandidates.length} included`,
      "- Retrieval: HydraDB structural traversal compared with the same lexical seed signals.",
      "- Token counts are approximate (characters / 4).",
      ...(options.diff ? [`- Diff: ${options.diff.baseRef} -> ${options.diff.headRef} (${options.diff.files.length} changed files)`] : []),
      "- Seeds:",
      ...seedLines,
      "",
    ].join("\n");
    const hunks = selectedHunks.length > 0 ? `## Changed hunks\n\n${selectedHunks.join("\n\n")}\n\n` : "";
    const context = items.length > 0 ? `## Selected context\n\n${items.map(itemMarkdown).join("\n\n")}\n` : "";
    return `${header}${hunks}${context}`;
  };

  let markdown = render();
  while (estimateTokens(markdown) > options.budget && items.length > 0) {
    const removed = items.pop()!;
    omitted.push({ id: removed.nodeId, path: removed.path, reason: "Final rendered pack exceeded the token budget." });
    markdown = render();
  }
  while (estimateTokens(markdown) > options.budget && selectedHunks.length > 0) {
    selectedHunks.pop();
    markdown = render();
  }
  const finalEstimate = estimateTokens(markdown);
  if (finalEstimate > options.budget) throw new Error("Context Pack metadata exceeds the requested budget; use a larger budget.");

  return {
    schemaVersion: 1,
    generatedAt,
    repository: { root: index.root, commit: index.indexedCommit },
    analysis: { task: options.task, depth: impact.depth, budget: options.budget, namespace: options.namespace, graphId: options.graphId, diff: options.diff },
    seeds: impact.seeds.map((seed) => ({
      id: seed.node.id,
      path: String(seed.node.properties.path ?? ""),
      symbol: seed.node.label === "Symbol" ? String(seed.node.properties.qualifiedName) : undefined,
      source: seed.source,
      confidence: seed.confidence,
      reason: seed.reason,
    })),
    diffHunks: { included: selectedHunks.length, total: hunkCandidates.length },
    items,
    omitted,
    estimatedTokens: finalEstimate,
    budgetUtilization: Number(Math.min(1, finalEstimate / options.budget).toFixed(3)),
    markdown,
  };
}
