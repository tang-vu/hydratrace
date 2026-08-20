import { describe, expect, it } from "vitest";
import { scoreImpact } from "../src/core/impact/scoring";
import type { GraphNode } from "../src/core/graph/model";

const productionNode: GraphNode = {
  id: 2, label: "Symbol", canonicalKey: "symbol:test",
  properties: { path: "src/service.ts", name: "service", exported: true, fileKind: "source" },
};

describe("impact scoring", () => {
  it("returns a normalized auditable decomposition", () => {
    const result = scoreImpact(productionNode, {
      seedId: 1, nodeIds: [1, 2], cost: 1,
      relationships: [{ type: "CALLS", source: 2, target: 1 }],
    }, false, 2);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.risk).toBe("High");
    expect(result.signals.map((signal) => signal.signal)).toContain("runtime-dependency");
  });
});

