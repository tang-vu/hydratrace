import { describe, expect, it } from "vitest";
import { attachChangeSet, mapDiffToSeeds, parseUnifiedDiff } from "../src/core/diff/parser";
import { indexRepository } from "../src/core/indexer";

const DIFF = `diff --git a/src/pricing/coupon.ts b/src/pricing/coupon.ts
index 1111111..2222222 100644
--- a/src/pricing/coupon.ts
+++ b/src/pricing/coupon.ts
@@ -17 +17 @@ export function applyCoupon(order: OrderDraft): number {
-old
+new
`;

describe("Git diff seeding", () => {
  it("parses zero-context hunks and statuses", () => {
    const parsed = parseUnifiedDiff(DIFF);
    expect(parsed.files).toEqual([expect.objectContaining({ path: "src/pricing/coupon.ts", status: "modified", ranges: [{ startLine: 17, lineCount: 1 }] })]);
    expect(parsed.files[0]?.hunks[0]).toMatchObject({ oldStartLine: 17, startLine: 17, lines: ["-old", "+new", ""] });
  });

  it("maps changed lines to the smallest enclosing symbol", async () => {
    const index = await indexRepository("fixtures/shopflow");
    const seeds = mapDiffToSeeds(index, parseUnifiedDiff(DIFF));
    expect(seeds[0]?.node.properties.name).toBe("applyCoupon");
    expect(seeds[0]?.confidence).toBe(1);
    const changeSet = attachChangeSet(index, parseUnifiedDiff(DIFF), seeds, "base", "head");
    expect(changeSet?.label).toBe("ChangeSet");
    expect(index.edges).toContainEqual(expect.objectContaining({ type: "TOUCHES", source: changeSet?.id, target: seeds[0]?.node.id }));
  });

  it("parses added, renamed, and deleted files without pretending deleted symbols still exist", async () => {
    const raw = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const newValue = 1;
+export const second = 2;
diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts
diff --git a/src/removed.ts b/src/removed.ts
deleted file mode 100644
--- a/src/removed.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const removed = 1;
-export const second = 2;
`;
    const parsed = parseUnifiedDiff(raw);
    expect(parsed.files.map((file) => file.status)).toEqual(["added", "renamed", "deleted"]);
    expect(parsed.files[0]?.ranges).toEqual([{ startLine: 1, lineCount: 2 }]);
    expect(parsed.files[2]?.ranges).toEqual([{ startLine: 0, lineCount: 0 }]);
    const index = await indexRepository("fixtures/shopflow");
    const seeds = mapDiffToSeeds(index, parsed);
    const deleted = seeds.find((seed) => seed.node.properties.deleted === true);
    expect(deleted?.node.properties.path).toBe("src/removed.ts");
    expect(deleted?.reason).toMatch(/without inventing prior symbols/);
  });
});
