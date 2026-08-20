import type { runAnalysis } from "../core/service";

type AnalysisResult = Awaited<ReturnType<typeof runAnalysis>>;

/**
 * Keep the MCP payload focused on evidence an agent can act on. The complete
 * local index is intentionally excluded: it is large, redundant, and would
 * consume the context budget before the selected source snippets arrive.
 */
export function toAgentContext(result: AnalysisResult) {
  return {
    schemaVersion: result.schemaVersion,
    generatedAt: result.generatedAt,
    repository: {
      root: result.index.root,
      commit: result.index.indexedCommit,
      indexedAt: result.index.indexedAt,
      diagnostics: result.index.diagnostics,
    },
    hydra: result.hydra,
    ingestion: result.ingestion,
    analysis: {
      depth: result.impact.depth,
      lowConfidence: result.impact.lowConfidence,
      graphCounts: result.impact.graphCounts,
      seeds: result.impact.seeds.map((seed) => ({
        id: seed.node.id,
        path: String(seed.node.properties.path ?? ""),
        symbol: seed.node.label === "Symbol" ? String(seed.node.properties.qualifiedName) : undefined,
        source: seed.source,
        confidence: seed.confidence,
        reason: seed.reason,
      })),
      recommendations: result.impact.recommendations.map((item) => ({
        id: item.node.id,
        path: item.path,
        symbol: item.symbol,
        startLine: item.startLine,
        endLine: item.endLine,
        score: item.score,
        risk: item.risk,
        reason: item.reason,
        evidencePath: item.evidenceText,
        evidence: item.evidence,
        scoreSignals: item.scoreSignals,
        isTest: item.isTest,
        foundByBaseline: item.foundByBaseline,
        estimatedTokens: item.estimatedTokens,
        independentPathCount: item.independentPathCount,
      })),
      queryReceipts: result.impact.queryReceipts,
    },
    baseline: result.baseline,
    diff: result.diff ? {
      baseRef: result.diff.baseRef,
      headRef: result.diff.headRef,
      totalFiles: result.diff.files.length,
      files: result.diff.files.slice(0, 100).map((file) => ({
        path: file.path,
        oldPath: file.oldPath,
        status: file.status,
        ranges: file.ranges,
      })),
      truncated: result.diff.files.length > 100,
    } : undefined,
    contextPack: result.contextPack,
  };
}

export type AgentContext = ReturnType<typeof toAgentContext>;
