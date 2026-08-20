import type { ContextPack } from "../context/pack";
import type { GraphNode, IndexedRepository } from "../graph/model";
import type { ImpactAnalysis } from "../impact/types";
import type { RepositoryId } from "./catalog";

interface WebAnalysisShape {
  index: IndexedRepository;
  impact: ImpactAnalysis;
  contextPack: ContextPack;
}

export function publicRepositoryRoot(id: RepositoryId): string {
  return id === "shopflow" ? "fixtures/shopflow" : ".";
}

/** Remove workstation-specific absolute roots while retaining public graph evidence. */
export function sanitizeAnalysisForWeb<T extends WebAnalysisShape>(result: T, repositoryId: RepositoryId): T {
  const publicRoot = publicRepositoryRoot(repositoryId);
  const publicRepositoryKey = `repository:${publicRoot}`;
  const sanitizeNode = (node: GraphNode): GraphNode => node.label === "Repository"
    ? { ...node, canonicalKey: publicRepositoryKey }
    : node;

  return {
    ...result,
    index: {
      ...result.index,
      root: publicRoot,
      repository: sanitizeNode(result.index.repository),
      nodes: result.index.nodes.map(sanitizeNode),
    },
    impact: {
      ...result.impact,
      seeds: result.impact.seeds.map((seed) => ({ ...seed, node: sanitizeNode(seed.node) })),
      recommendations: result.impact.recommendations.map((recommendation) => ({
        ...recommendation,
        node: sanitizeNode(recommendation.node),
      })),
    },
    contextPack: {
      ...result.contextPack,
      repository: { ...result.contextPack.repository, root: publicRoot },
    },
  };
}

export function sanitizeWebError(error: unknown, privateRoot = process.cwd()): string {
  const message = error instanceof Error ? error.message : String(error);
  const variants = [privateRoot, privateRoot.replaceAll("\\", "/")];
  return variants.reduce((safe, value) => value ? safe.replaceAll(value, "<registered-repository>") : safe, message);
}
