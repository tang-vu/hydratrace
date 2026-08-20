import type { GraphNode, IndexedRepository } from "../graph/model";

const STOP_WORDS = new Set(["a", "an", "and", "before", "break", "call", "caller", "callers", "change", "code", "context", "find", "for", "from", "impact", "in", "of", "or", "test", "tests", "the", "to", "with"]);

export function taskTokens(task: string): string[] {
  return [...new Set((task.match(/[A-Za-z_$][\w$.-]*/g) ?? [])
    .flatMap((token) => token.toLowerCase().split(/[./_-]+/))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

export interface LexicalResult {
  node: GraphNode;
  score: number;
  reason: string;
}

export function lexicalSearch(index: IndexedRepository, task: string, limit = 10): LexicalResult[] {
  const tokens = taskTokens(task);
  const quoted = [...task.matchAll(/["'`](.*?)["'`]/g)].map((match) => match[1]!.toLowerCase());
  return index.nodes
    .filter((node) => node.label === "File" || node.label === "Symbol")
    .map((node) => {
      const name = String(node.properties.name ?? "").toLowerCase();
      const qualified = String(node.properties.qualifiedName ?? "").toLowerCase();
      const path = String(node.properties.path ?? "").toLowerCase();
      const haystack = `${name} ${qualified} ${path}`;
      let score = 0;
      const reasons: string[] = [];
      for (const phrase of quoted) if (haystack.includes(phrase)) { score += 0.7; reasons.push(`quoted match “${phrase}”`); }
      for (const token of tokens) {
        if (name === token || qualified === token) { score += 1; reasons.push(`exact name ${token}`); }
        else if (name.includes(token) || qualified.includes(token)) { score += 0.55; reasons.push(`symbol token ${token}`); }
        else if (path.split("/").some((part) => part.replace(/\.[^.]+$/, "") === token)) { score += 0.45; reasons.push(`path segment ${token}`); }
        else if (path.includes(token)) { score += 0.25; reasons.push(`path token ${token}`); }
      }
      return { node, score: Number(Math.min(1, score).toFixed(3)), reason: reasons.join(", ") || "no lexical match" };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id - b.node.id)
    .slice(0, limit);
}

export function taskSeeds(index: IndexedRepository, task: string, limit = 3): ChangeSeed[] {
  const candidates = lexicalSearch(index, task, Math.max(10, limit));
  const threshold = (candidates[0]?.score ?? 0) * 0.75;
  return candidates.filter((result) => result.score >= threshold).slice(0, limit).map((result) => ({
    node: result.node,
    source: "task" as const,
    confidence: result.score,
    reason: result.reason,
  }));
}

import type { ChangeSeed } from "../impact/types";
