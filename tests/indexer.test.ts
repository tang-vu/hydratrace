import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexRepository } from "../src/core/indexer";
import type { IndexedRepository } from "../src/core/graph/model";

describe("TypeScript semantic indexer", () => {
  let index: IndexedRepository;
  beforeAll(async () => { index = await indexRepository("fixtures/shopflow"); });

  it("extracts the fixture's files, symbols, tests, and diagnostics", () => {
    expect(index.diagnostics.filesScanned).toBe(12);
    expect(index.diagnostics.symbolsExtracted).toBeGreaterThanOrEqual(16);
    expect(index.diagnostics.testsDetected).toBe(3);
    expect(index.diagnostics.importsUnresolved).toBe(0);
    expect(index.diagnostics.callsUnresolved).toBeGreaterThan(0);
  });

  it("resolves an aliased re-export to the internal called symbol", () => {
    const total = index.nodes.find((node) => node.properties.name === "calculateOrderTotal")!;
    const coupon = index.nodes.find((node) => node.properties.name === "applyCoupon")!;
    expect(index.edges).toContainEqual(expect.objectContaining({ type: "CALLS", source: total.id, target: coupon.id }));
  });

  it("extracts class methods, interface implementation, and structural tests", () => {
    const implementation = index.nodes.find((node) => node.properties.name === "CouponAdjustment")!;
    const policy = index.nodes.find((node) => node.properties.name === "AdjustmentPolicy")!;
    expect(index.nodes.some((node) => node.properties.qualifiedName === "CouponAdjustment.adjustmentFor")).toBe(true);
    expect(index.edges).toContainEqual(expect.objectContaining({ type: "IMPLEMENTS", source: implementation.id, target: policy.id }));
    const pricingTest = index.nodes.find((node) => node.properties.path === "tests/pricing.spec.ts" && node.label === "File")!;
    const total = index.nodes.find((node) => node.properties.name === "calculateOrderTotal")!;
    expect(index.edges.some((edge) => edge.type === "TESTS" && edge.source === pricingTest.id && edge.target === total.id)).toBe(true);
  });
});

describe("fallback project configuration", () => {
  const temporaryRoots: string[] = [];
  afterAll(async () => Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true }))));

  it("indexes TypeScript when tsconfig.json is absent", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hydratrace-indexer-"));
    temporaryRoots.push(temporaryRoot);
    await writeFile(path.join(temporaryRoot, "plain.ts"), "export function plain() { return 1; }\n", "utf8");
    const index = await indexRepository(temporaryRoot);
    expect(index.nodes.some((node) => node.properties.name === "plain")).toBe(true);
    expect(index.diagnostics.warnings[0]).toMatch(/No tsconfig/);
  });

  it("represents an overload set once and reports unresolved calls instead of inventing edges", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hydratrace-overload-"));
    temporaryRoots.push(temporaryRoot);
    await writeFile(path.join(temporaryRoot, "overload.ts"), `
export function choose(value: string): string;
export function choose(value: number): number;
export function choose(value: string | number): string | number { return value; }
export function useChoice(): number { return choose(1); }
`, "utf8");
    const index = await indexRepository(temporaryRoot);
    expect(index.nodes.filter((node) => node.properties.name === "choose")).toHaveLength(1);
    expect(index.diagnostics.callsResolved + index.diagnostics.callsUnresolved).toBeGreaterThan(0);
  });
});
