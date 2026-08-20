import { describe, expect, it } from "vitest";
import type { ContextPack } from "../src/core/context/pack";
import type { IndexedRepository } from "../src/core/graph/model";
import type { ImpactAnalysis } from "../src/core/impact/types";
import { sanitizeAnalysisForWeb, sanitizeWebError } from "../src/core/repositories/public-analysis";

const privateRoot = "C:\\Users\\owner\\Documents\\GitHub\\hydratrace\\fixtures\\shopflow";
const repositoryNode = {
  id: 1,
  label: "Repository" as const,
  canonicalKey: `repository:${privateRoot.toLowerCase()}`,
  properties: { name: "shopflow" },
};

describe("public analysis sanitization", () => {
  it("removes private absolute roots without discarding graph evidence", () => {
    const index: IndexedRepository = {
      schemaVersion: 1,
      root: privateRoot,
      rootHash: "abc",
      repository: repositoryNode,
      nodes: [repositoryNode],
      edges: [],
      diagnostics: {
        filesScanned: 1, filesExcluded: 0, symbolsExtracted: 0,
        importsResolved: 0, importsUnresolved: 0, callsResolved: 0,
        callsUnresolved: 0, testsDetected: 0, nodesWritten: 1,
        edgesWritten: 0, elapsedMs: 1, warnings: [],
      },
      indexedAt: "2026-08-20T00:00:00.000Z",
      indexedCommit: "abc123",
    };
    const impact: ImpactAnalysis = {
      seeds: [{ node: repositoryNode, source: "task", confidence: 1, reason: "exact" }],
      recommendations: [], paths: [], baselineNodeIds: [], queryReceipts: [],
      graphCounts: { nodes: 1, edges: 0 }, depth: 1, lowConfidence: false,
    };
    const contextPack = {
      repository: { root: privateRoot, commit: "abc123" },
    } as ContextPack;

    const sanitized = sanitizeAnalysisForWeb({ index, impact, contextPack }, "shopflow");
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.index.root).toBe("fixtures/shopflow");
    expect(sanitized.contextPack.repository.root).toBe("fixtures/shopflow");
    expect(sanitized.impact.seeds[0]?.node.canonicalKey).toBe("repository:fixtures/shopflow");
    expect(serialized).not.toContain("Users");
    expect(sanitized.impact.seeds[0]?.confidence).toBe(1);
  });

  it("redacts private roots from operational errors", () => {
    expect(sanitizeWebError(new Error(`Cannot read ${privateRoot}\\secret.ts`), privateRoot))
      .toBe("Cannot read <registered-repository>\\secret.ts");
  });
});
