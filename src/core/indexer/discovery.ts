import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".next", ".nuxt", ".output", ".turbo", ".hydratrace", "node_modules",
  "dist", "build", "coverage", "out", "generated", ".cache", ".parcel-cache",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

export interface DiscoveryResult {
  root: string;
  files: string[];
  excluded: number;
}

export function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isTestPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  return /(^|\/)__tests__(\/|$)/.test(normalized) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

export function fileKind(relativePath: string): "source" | "test" | "config" | "declaration" {
  if (isTestPath(relativePath)) return "test";
  if (/\.d\.[cm]?ts$/.test(relativePath)) return "declaration";
  if (/(^|\/)(tsconfig|next\.config|vite\.config|vitest\.config|eslint\.config)/.test(relativePath)) return "config";
  return "source";
}

export async function discoverSourceFiles(requestedRoot: string): Promise<DiscoveryResult> {
  const root = await realpath(path.resolve(requestedRoot));
  const files: string[] = [];
  let excluded = 0;

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        excluded += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          excluded += 1;
        } else {
          await walk(absolute);
        }
        continue;
      }
      const stats = await lstat(absolute);
      const extension = path.extname(entry.name).toLowerCase();
      if (!stats.isFile() || !SOURCE_EXTENSIONS.has(extension) || stats.size > 2_000_000) {
        excluded += 1;
        continue;
      }
      files.push(absolute);
    }
  }

  await walk(root);
  return { root, files, excluded };
}

export function assertInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${candidate}`);
  }
}

