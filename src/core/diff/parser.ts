import { execFileSync } from "node:child_process";
import type { GraphNode, IndexedRepository } from "../graph/model";
import { stableId } from "../graph/ids";
import { fileKind, isTestPath, normalizeRelativePath } from "../indexer/discovery";
import type { ChangeSeed } from "../impact/types";

export type DiffStatus = "added" | "modified" | "renamed" | "deleted";

export interface ChangedRange {
  startLine: number;
  lineCount: number;
}

export interface DiffHunk extends ChangedRange {
  oldStartLine: number;
  oldLineCount: number;
  header: string;
  lines: string[];
}

export interface ChangedFile {
  oldPath?: string;
  path: string;
  status: DiffStatus;
  ranges: ChangedRange[];
  hunks: DiffHunk[];
}

export interface ParsedDiff {
  files: ChangedFile[];
  raw: string;
  baseRef?: string;
  headRef?: string;
}

export function parseUnifiedDiff(raw: string): ParsedDiff {
  const files: ChangedFile[] = [];
  let current: ChangedFile | undefined;
  let currentHunk: DiffHunk | undefined;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (!match) continue;
      current = { oldPath: normalizeRelativePath(match[1]!), path: normalizeRelativePath(match[2]!), status: "modified", ranges: [], hunks: [] };
      currentHunk = undefined;
      files.push(current);
    } else if (current && line.startsWith("new file mode")) {
      current.status = "added";
      current.oldPath = undefined;
    } else if (current && line.startsWith("deleted file mode")) {
      current.status = "deleted";
    } else if (current && line.startsWith("rename from ")) {
      current.status = "renamed";
      current.oldPath = normalizeRelativePath(line.slice("rename from ".length));
    } else if (current && line.startsWith("rename to ")) {
      current.path = normalizeRelativePath(line.slice("rename to ".length));
    } else if (current && line.startsWith("@@")) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        currentHunk = {
          oldStartLine: Number(hunk[1]),
          oldLineCount: hunk[2] === undefined ? 1 : Number(hunk[2]),
          startLine: Number(hunk[3]),
          lineCount: hunk[4] === undefined ? 1 : Number(hunk[4]),
          header: line,
          lines: [],
        };
        current.ranges.push({ startLine: currentHunk.startLine, lineCount: currentHunk.lineCount });
        current.hunks.push(currentHunk);
      }
    } else if (currentHunk && (/^[ +\\-]/.test(line) || line === "")) {
      currentHunk.lines.push(line);
    }
  }
  return { files, raw };
}

export function readGitDiff(root: string, base?: string, head?: string): ParsedDiff {
  let args: string[];
  let baseRef: string;
  let headRef: string;
  if (base && head) {
    args = ["-C", root, "diff", "--unified=0", "--find-renames", base, head, "--"];
    baseRef = base;
    headRef = head;
  } else if (base) {
    args = ["-C", root, "diff", "--unified=0", "--find-renames", base, "--"];
    baseRef = base;
    headRef = "worktree";
  } else if (head) {
    args = ["-C", root, "diff", "--unified=0", "--find-renames", "HEAD", head, "--"];
    baseRef = "HEAD";
    headRef = head;
  }
  else {
    const dirty = execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    if (dirty) {
      args = ["-C", root, "diff", "--unified=0", "--find-renames", "HEAD", "--"];
      baseRef = "HEAD";
      headRef = "worktree";
    }
    else {
      try {
        execFileSync("git", ["-C", root, "rev-parse", "HEAD^"], { stdio: "ignore" });
        args = ["-C", root, "diff", "--unified=0", "--find-renames", "HEAD^", "HEAD", "--"];
        baseRef = "HEAD^";
        headRef = "HEAD";
      } catch {
        return { files: [], raw: "", baseRef: "HEAD", headRef: "HEAD" };
      }
    }
  }
  return {
    ...parseUnifiedDiff(execFileSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })),
    baseRef,
    headRef,
  };
}

function lineIntersects(node: GraphNode, range: ChangedRange): boolean {
  const start = Number(node.properties.startLine);
  const end = Number(node.properties.endLine);
  if (range.lineCount === 0) return start <= range.startLine && end >= range.startLine;
  const rangeEnd = range.startLine + range.lineCount - 1;
  return start <= rangeEnd && end >= range.startLine;
}

export function mapDiffToSeeds(index: IndexedRepository, diff: ParsedDiff): ChangeSeed[] {
  const seeds = new Map<number, ChangeSeed>();
  for (const changed of diff.files) {
    const paths = new Set([changed.path, changed.oldPath].filter((value): value is string => Boolean(value)));
    let fileNode = index.nodes.find((node) => node.label === "File" && paths.has(String(node.properties.path)));
    const candidates = index.nodes.filter((node) => node.label === "Symbol" && paths.has(String(node.properties.path)));
    let matched = false;
    for (const range of changed.ranges) {
      const enclosing = candidates.filter((node) => lineIntersects(node, range))
        .sort((a, b) => (Number(a.properties.endLine) - Number(a.properties.startLine)) - (Number(b.properties.endLine) - Number(b.properties.startLine)))[0];
      if (enclosing) {
        matched = true;
        seeds.set(enclosing.id, {
          node: enclosing, source: "diff", confidence: 1,
          reason: `${changed.status} lines ${range.startLine}-${range.startLine + Math.max(range.lineCount - 1, 0)} intersect ${String(enclosing.properties.qualifiedName)}.`,
        });
      }
    }
    if (!matched && fileNode) {
      seeds.set(fileNode.id, { node: fileNode, source: "diff", confidence: 0.9, reason: `${changed.status} file has changes outside an indexed symbol.` });
    } else if (!matched && changed.status === "deleted") {
      const deletedPath = changed.oldPath ?? changed.path;
      const canonicalKey = `file:${index.rootHash}:${deletedPath}`;
      const id = stableId(canonicalKey);
      const collision = index.nodes.find((node) => node.id === id && node.canonicalKey !== canonicalKey);
      if (collision) throw new Error(`Deleted file ID collides with ${collision.canonicalKey}.`);
      fileNode = {
        id,
        label: "File",
        canonicalKey,
        properties: {
          path: deletedPath,
          extension: deletedPath.includes(".") ? `.${deletedPath.split(".").at(-1)}` : "",
          kind: fileKind(deletedPath),
          fileKind: fileKind(deletedPath),
          lineCount: 0,
          contentHash: "deleted",
          isTest: isTestPath(deletedPath),
          deleted: true,
          rootHash: index.rootHash,
        },
      };
      index.nodes.push(fileNode);
      const edgeKey = `edge:CONTAINS:${index.repository.id}:${fileNode.id}`;
      const edgeId = stableId(edgeKey);
      if (!index.edges.some((edge) => edge.id === edgeId)) {
        index.edges.push({ id: edgeId, type: "CONTAINS", source: index.repository.id, target: fileNode.id, properties: { confidence: "diff", rootHash: index.rootHash } });
      }
      seeds.set(fileNode.id, {
        node: fileNode,
        source: "diff",
        confidence: 0.75,
        reason: `Deleted file ${deletedPath} is unavailable in the current tree; HydraTrace preserves an honest file-level seed without inventing prior symbols.`,
      });
    }
  }
  index.nodes.sort((a, b) => a.id - b.id);
  index.edges.sort((a, b) => a.id - b.id);
  return [...seeds.values()];
}

export function attachChangeSet(
  index: IndexedRepository,
  diff: ParsedDiff,
  seeds: ChangeSeed[],
  baseRef = "HEAD",
  headRef = "worktree",
): GraphNode | undefined {
  if (diff.files.length === 0 || seeds.length === 0) return undefined;
  const canonicalKey = `changeset:${index.rootHash}:${baseRef}:${headRef}`;
  const id = stableId(canonicalKey);
  const collision = index.nodes.find((node) => node.id === id && node.canonicalKey !== canonicalKey);
  if (collision) throw new Error(`ChangeSet ID collides with ${collision.canonicalKey}.`);
  const node: GraphNode = {
    id,
    label: "ChangeSet",
    canonicalKey,
    properties: {
      baseRef,
      headRef,
      summary: `${diff.files.length} changed file${diff.files.length === 1 ? "" : "s"}`,
      timestamp: new Date().toISOString(),
      rootHash: index.rootHash,
    },
  };
  index.nodes.push(node);
  for (const seed of seeds) {
    const edgeKey = `edge:TOUCHES:${id}:${seed.node.id}`;
    const edgeId = stableId(edgeKey);
    const edgeCollision = index.edges.find((edge) => edge.id === edgeId && (edge.source !== id || edge.target !== seed.node.id || edge.type !== "TOUCHES"));
    if (edgeCollision) throw new Error(`TOUCHES edge ID collides with edge ${edgeCollision.id}.`);
    if (!index.edges.some((edge) => edge.id === edgeId)) {
      index.edges.push({ id: edgeId, type: "TOUCHES", source: id, target: seed.node.id, properties: { confidence: "diff", rootHash: index.rootHash } });
    }
  }
  index.nodes.sort((a, b) => a.id - b.id);
  index.edges.sort((a, b) => a.id - b.id);
  return node;
}
