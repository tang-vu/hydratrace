import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { assertInsideRoot, discoverSourceFiles, fileKind, isTestPath, normalizeRelativePath } from "../src/core/indexer/discovery";

describe("repository path safety", () => {
  const temporaryRoots: string[] = [];
  afterEach(async () => Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
  it("normalizes paths and classifies common test conventions", () => {
    expect(normalizeRelativePath("src\\pricing\\total.ts")).toBe("src/pricing/total.ts");
    expect(isTestPath("src/__tests__/cart.ts")).toBe(true);
    expect(isTestPath("tests/cart.spec.ts")).toBe(true);
    expect(fileKind("src/types.d.ts")).toBe("declaration");
  });

  it("rejects candidates outside the requested root", () => {
    const root = path.resolve("fixtures/shopflow");
    expect(() => assertInsideRoot(root, path.resolve(root, "../outside.ts"))).toThrow(/escapes/i);
    expect(() => assertInsideRoot(root, path.resolve(root, "src/api/checkout-route.ts"))).not.toThrow();
  });

  it("ignores build dependencies and never follows directory symlinks outside the root", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "hydratrace-discovery-"));
    temporaryRoots.push(parent);
    const root = path.join(parent, "repo");
    const outside = path.join(parent, "outside");
    await Promise.all([mkdir(root), mkdir(outside), mkdir(path.join(root, "node_modules"))]);
    await Promise.all([
      writeFile(path.join(root, "source.ts"), "export const safe = true;\n"),
      writeFile(path.join(root, "node_modules", "ignored.ts"), "throw new Error('ignored');\n"),
      writeFile(path.join(outside, "secret.ts"), "export const secret = true;\n"),
    ]);
    await symlink(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    const discovered = await discoverSourceFiles(root);
    expect(discovered.files.map((file) => path.basename(file))).toEqual(["source.ts"]);
    expect(discovered.excluded).toBeGreaterThanOrEqual(2);
  });
});
