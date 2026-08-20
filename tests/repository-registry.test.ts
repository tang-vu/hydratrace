import path from "node:path";
import { describe, expect, it } from "vitest";
import { repositoryIdSchema, resolveRegisteredRepository } from "../src/core/repositories/registry";

describe("web repository registry", () => {
  it("resolves only server-owned allowlisted repository paths", () => {
    expect(resolveRegisteredRepository("shopflow")).toBe(path.resolve("fixtures", "shopflow"));
    expect(resolveRegisteredRepository("hydratrace")).toBe(path.resolve("."));
    expect(repositoryIdSchema.safeParse("../../secrets").success).toBe(false);
    expect(repositoryIdSchema.safeParse("C:\\Users\\arbitrary").success).toBe(false);
  });
});
