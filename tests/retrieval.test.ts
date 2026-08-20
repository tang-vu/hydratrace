import { beforeAll, describe, expect, it } from "vitest";
import type { IndexedRepository } from "../src/core/graph/model";
import { lexicalSearch, taskSeeds, taskTokens } from "../src/core/baseline/lexical";
import { indexRepository } from "../src/core/indexer";

describe("deterministic task seeding and lexical baseline", () => {
  let index: IndexedRepository;
  beforeAll(async () => { index = await indexRepository("fixtures/shopflow"); });

  it("extracts identifiers while excluding task boilerplate", () => {
    expect(taskTokens("Change applyCoupon and find callers and tests")).toEqual(["applycoupon"]);
  });

  it("selects the exact symbol with an auditable reason", () => {
    const seeds = taskSeeds(index, "Change applyCoupon and find callers and tests");
    expect(seeds).toHaveLength(1);
    expect(seeds[0]?.node.properties.name).toBe("applyCoupon");
    expect(seeds[0]?.reason).toMatch(/exact name/);
  });

  it("keeps the lexical baseline graph-free", () => {
    const results = lexicalSearch(index, "Change applyCoupon rounding behavior", 10);
    expect(results[0]?.node.properties.name).toBe("applyCoupon");
    expect(results.some((result) => result.node.properties.path === "src/api/checkout-route.ts")).toBe(false);
  });

  it("labels broad path-only task seeds with low deterministic confidence", () => {
    const seeds = taskSeeds(index, "pricing");
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.every((seed) => seed.confidence < 0.55)).toBe(true);
    expect(seeds[0]?.reason).toMatch(/path segment/);
  });
});
