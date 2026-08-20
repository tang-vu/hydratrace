import { describe, expect, it } from "vitest";
import { decodeHydraValue } from "../src/hydradb/values";
import { isTransientStatus } from "../src/hydradb/client";

describe("HydraDB boundary decoding", () => {
  it("decodes scalar/list tagged values", () => {
    expect(decodeHydraValue({ type: "vertex_id", value: 42 })).toBe(42);
    expect(decodeHydraValue({ type: "list", value: [{ type: "string", value: "CALLS" }] })).toEqual(["CALLS"]);
  });

  it("decodes nested externally-tagged properties inside native paths", () => {
    expect(decodeHydraValue({
      type: "path",
      value: {
        nodes: [{ id: 1, labels: ["Symbol"], properties: { name: { String: "applyCoupon" }, exported: { Bool: true } } }],
        relationships: [],
      },
    })).toEqual({ nodes: [{ id: 1, labels: ["Symbol"], properties: { name: "applyCoupon", exported: true } }], relationships: [] });
  });

  it("retries only bounded transient HTTP statuses", () => {
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(400)).toBe(false);
    expect(isTransientStatus(401)).toBe(false);
  });
});

