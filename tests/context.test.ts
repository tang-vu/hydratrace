import { describe, expect, it } from "vitest";
import { buildContextPack, estimateTokens } from "../src/core/context/pack";
import { parseUnifiedDiff } from "../src/core/diff/parser";
import { indexRepository } from "../src/core/indexer";
import type { ImpactAnalysis, ImpactRecommendation } from "../src/core/impact/types";

describe("Context Pack construction", () => {
  it("enforces its estimated token budget and deduplicates identical ranges", async () => {
    const index = await indexRepository("fixtures/shopflow");
    const node = index.nodes.find((item) => item.properties.name === "applyCoupon")!;
    const recommendation: ImpactRecommendation = {
      node, path: String(node.properties.path), symbol: String(node.properties.qualifiedName),
      startLine: Number(node.properties.startLine), endLine: Number(node.properties.endLine),
      score: 1, risk: "High", evidence: { seedId: node.id, nodeIds: [node.id], relationships: [], cost: 0 },
      evidenceText: "applyCoupon", reason: "Direct seed.", scoreSignals: [], isTest: false,
      foundByBaseline: true, estimatedTokens: 1, independentPathCount: 1,
    };
    const impact: ImpactAnalysis = {
      seeds: [{ node, source: "task", confidence: 1, reason: "exact" }],
      recommendations: [recommendation, recommendation], paths: [recommendation.evidence], baselineNodeIds: [node.id],
      queryReceipts: [], graphCounts: { nodes: 1, edges: 0 }, depth: 3, lowConfidence: false,
    };
    const pack = await buildContextPack(index, impact, { task: "change applyCoupon", budget: 400, namespace: "test", graphId: "test" });
    expect(pack.items).toHaveLength(1);
    expect(pack.estimatedTokens).toBeLessThanOrEqual(400);
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("records diff refs, bounded hunks, seed evidence, and generation time", async () => {
    const index = await indexRepository("fixtures/shopflow");
    const node = index.nodes.find((item) => item.properties.name === "applyCoupon")!;
    const recommendation: ImpactRecommendation = {
      node, path: String(node.properties.path), symbol: String(node.properties.qualifiedName),
      startLine: Number(node.properties.startLine), endLine: Number(node.properties.endLine),
      score: 1, risk: "High", evidence: { seedId: node.id, nodeIds: [node.id], relationships: [], cost: 0 },
      evidenceText: "applyCoupon", reason: "Direct seed.", scoreSignals: [], isTest: false,
      foundByBaseline: true, estimatedTokens: 1, independentPathCount: 1,
    };
    const impact: ImpactAnalysis = {
      seeds: [{ node, source: "diff", confidence: 1, reason: "changed line" }],
      recommendations: [recommendation], paths: [recommendation.evidence], baselineNodeIds: [],
      queryReceipts: [], graphCounts: { nodes: 1, edges: 0 }, depth: 2, lowConfidence: false,
    };
    const parsed = parseUnifiedDiff(`diff --git a/src/pricing/coupon.ts b/src/pricing/coupon.ts
--- a/src/pricing/coupon.ts
+++ b/src/pricing/coupon.ts
@@ -17 +17 @@
-old
+new
`);
    const pack = await buildContextPack(index, impact, {
      task: "change coupon",
      budget: 1_000,
      namespace: "test",
      graphId: "test",
      diff: { baseRef: "base", headRef: "head", files: parsed.files },
    });
    expect(pack.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pack.diffHunks).toEqual({ included: 1, total: 1 });
    expect(pack.markdown).toContain("Diff: base -> head");
    expect(pack.markdown).toContain("## Changed hunks");
    expect(pack.markdown).toContain("[diff, 1.00]");
    expect(pack.estimatedTokens).toBeLessThanOrEqual(1_000);
  });
});
