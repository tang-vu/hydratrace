import type { IndexedRepository } from "../graph/model";
import { isTestNode } from "../graph/model";
import { lexicalSearch } from "../baseline/lexical";
import type { HydraDbClient } from "../../hydradb/client";
import { graphCountQueries, pathTraversalQuery } from "../../hydradb/queries";
import type { QueryPath } from "../../hydradb/values";
import { scoreImpact } from "./scoring";
import type { ChangeSeed, EvidencePath, ImpactAnalysis, ImpactRecommendation, QueryReceipt } from "./types";

function evidenceText(path: EvidencePath, nodeById: Map<number, IndexedRepository["nodes"][number]>): string {
  const first = nodeById.get(path.nodeIds[0]!);
  if (!first) return "Unknown path";
  let output = String(first.properties.qualifiedName ?? first.properties.name ?? first.properties.path ?? first.id);
  for (let index = 0; index < path.relationships.length; index += 1) {
    const relationship = path.relationships[index]!;
    const current = path.nodeIds[index]!;
    const next = path.nodeIds[index + 1]!;
    const arrow = relationship.source === current && relationship.target === next ? ` -${relationship.type}-> ` : ` <-${relationship.type}- `;
    const target = nodeById.get(next);
    output += `${arrow}${String(target?.properties.qualifiedName ?? target?.properties.name ?? target?.properties.path ?? next)}`;
  }
  return output;
}

function convertPath(seedId: number, value: QueryPath, cost: number): EvidencePath {
  return {
    seedId,
    nodeIds: value.nodes.map((node) => node.id),
    relationships: value.relationships.map((relationship) => ({
      id: relationship.id ?? undefined,
      type: relationship.edge_type,
      source: relationship.src,
      target: relationship.dst,
    })),
    cost,
  };
}

function chooseBest(paths: EvidencePath[]): EvidencePath {
  return [...paths].sort((a, b) => a.relationships.length - b.relationships.length || a.cost - b.cost || a.seedId - b.seedId)[0]!;
}

export async function analyzeImpact(
  client: HydraDbClient,
  index: IndexedRepository,
  seeds: ChangeSeed[],
  task: string,
  depth = 3,
  resultLimit = 100,
): Promise<ImpactAnalysis> {
  if (seeds.length === 0) throw new Error("No change seeds were found. Provide a diff or a more specific task.");
  const query = pathTraversalQuery(depth, Math.min(200, resultLimit));
  const paths: EvidencePath[] = [];
  const queryReceipts: QueryReceipt[] = [];
  for (const [indexSeed, seed] of seeds.slice(0, 5).entries()) {
    const queryId = `hydratrace-impact-${indexSeed + 1}-${seed.node.id}`;
    const result = await client.query(query, { queryId, parameters: { source: seed.node.id }, consistency: "causal", pageSize: 200 });
    for (const row of result.rows) {
      const path = row[0];
      if (typeof path === "object" && path !== null && !Array.isArray(path) && "nodes" in path) {
        paths.push(convertPath(seed.node.id, path as QueryPath, typeof row[1] === "number" ? row[1] : 0));
      }
    }
    queryReceipts.push({ queryId, query, latencyMs: result.latencyMs, resultCount: result.rows.length, pageCount: result.pages, bookmarkUsed: Boolean(client.latestBookmark), readEpoch: result.readEpoch });
  }

  for (const seed of seeds) {
    paths.push({ seedId: seed.node.id, nodeIds: [seed.node.id], relationships: [], cost: 0 });
  }
  const unique = new Map<string, EvidencePath>();
  for (const path of paths) unique.set(`${path.seedId}:${path.nodeIds.join("-")}:${path.relationships.map((r) => r.type).join("-")}`, path);
  const deduplicated = [...unique.values()].filter((path) => path.nodeIds.length > 0);
  const nodeById = new Map(index.nodes.map((node) => [node.id, node]));
  const baseline = lexicalSearch(index, task, resultLimit);
  const baselineIds = new Set(baseline.map((result) => result.node.id));
  const pathGroups = new Map<number, EvidencePath[]>();
  for (const path of deduplicated) {
    const target = path.nodeIds.at(-1)!;
    pathGroups.set(target, [...(pathGroups.get(target) ?? []), path]);
  }
  const seedIds = new Set(seeds.map((seed) => seed.node.id));
  const recommendations: ImpactRecommendation[] = [];
  for (const [nodeId, candidatePaths] of pathGroups) {
    const node = nodeById.get(nodeId);
    if (!node || node.label === "Repository") continue;
    const path = chooseBest(candidatePaths);
    const independent = new Set(candidatePaths.map((candidate) => `${candidate.seedId}:${candidate.relationships.map((r) => r.type).join("/")}`)).size;
    const scored = scoreImpact(node, path, seedIds.has(nodeId), independent);
    recommendations.push({
      node,
      path: String(node.properties.path ?? ""),
      symbol: node.label === "Symbol" ? String(node.properties.qualifiedName) : undefined,
      startLine: node.label === "Symbol" ? Number(node.properties.startLine) : undefined,
      endLine: node.label === "Symbol" ? Number(node.properties.endLine) : undefined,
      score: scored.score,
      risk: scored.risk,
      evidence: path,
      evidenceText: evidenceText(path, nodeById),
      reason: scored.reason,
      scoreSignals: scored.signals,
      isTest: isTestNode(node),
      foundByBaseline: baselineIds.has(nodeId),
      estimatedTokens: Math.max(24, Math.ceil(String(node.properties.signature ?? node.properties.path ?? "").length / 4)),
      independentPathCount: independent,
    });
  }
  recommendations.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.node.id - b.node.id);
  const counts = graphCountQueries();
  const nodeCount = await client.query(counts.nodes, { queryId: "hydratrace-count-nodes", parameters: { rootHash: index.rootHash }, consistency: "causal" });
  const edgeCount = await client.query(counts.edges, { queryId: "hydratrace-count-edges", parameters: { rootHash: index.rootHash }, consistency: "causal" });
  queryReceipts.push(
    { queryId: nodeCount.queryId, query: counts.nodes, latencyMs: nodeCount.latencyMs, resultCount: nodeCount.rows.length, pageCount: nodeCount.pages, bookmarkUsed: Boolean(client.latestBookmark), readEpoch: nodeCount.readEpoch },
    { queryId: edgeCount.queryId, query: counts.edges, latencyMs: edgeCount.latencyMs, resultCount: edgeCount.rows.length, pageCount: edgeCount.pages, bookmarkUsed: Boolean(client.latestBookmark), readEpoch: edgeCount.readEpoch },
  );
  return {
    seeds,
    recommendations: recommendations.slice(0, resultLimit),
    paths: deduplicated,
    baselineNodeIds: [...baselineIds],
    queryReceipts,
    graphCounts: {
      nodes: nodeCount.rows.reduce((sum, row) => sum + Number(row[0] ?? 0), 0),
      edges: edgeCount.rows.reduce((sum, row) => sum + Number(row[0] ?? 0), 0),
    },
    depth,
    lowConfidence: seeds.every((seed) => seed.confidence < 0.55),
  };
}
