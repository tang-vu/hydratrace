import { describe, expect, it } from "vitest";
import { IdRegistry, MAX_SAFE_GRAPH_ID, stableId } from "../src/core/graph/ids";

describe("deterministic graph IDs", () => {
  it("stays stable and within JavaScript's safe graph range", () => {
    const first = stableId("symbol:src/cart.ts:checkout:function");
    expect(first).toBe(stableId("symbol:src/cart.ts:checkout:function"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(MAX_SAFE_GRAPH_ID);
    expect(Number.isSafeInteger(first)).toBe(true);
  });

  it("detects a collision instead of silently aliasing keys", () => {
    const registry = new IdRegistry();
    registry.claim("file:a.ts", 42);
    expect(() => registry.claim("file:b.ts", 42)).toThrow(/collision/i);
  });
});

