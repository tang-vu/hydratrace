import { isTestNode, type GraphNode } from "../graph/model";
import type { EvidencePath, RiskLevel, ScoreSignal } from "./types";

export interface ScoreResult { score: number; risk: RiskLevel; signals: ScoreSignal[]; reason: string }

export function scoreImpact(node: GraphNode, evidence: EvidencePath, isSeed: boolean, independentPaths: number): ScoreResult {
  const hops = evidence.relationships.length;
  const relationships = new Set(evidence.relationships.map((relationship) => relationship.type));
  const signals: ScoreSignal[] = [];
  const add = (signal: string, contribution: number, explanation: string) => signals.push({ signal, contribution, explanation });
  if (isSeed) add("change-seed", 1, "Directly selected from the diff or task.");
  else add("path-distance", Math.max(0.28, 0.82 - (hops - 1) * 0.18), `${hops}-hop structural evidence path.`);
  if (!isSeed && (relationships.has("CALLS") || relationships.has("IMPORTS"))) add("runtime-dependency", 0.1, "Connected through a call or import dependency.");
  if (isTestNode(node)) add("test-coverage", 0.08, "A structurally connected test can validate the change.");
  if (node.properties.exported === true) add("public-surface", 0.06, "Exported symbols have a wider contract surface.");
  if (independentPaths > 1) add("independent-evidence", Math.min(0.08, (independentPaths - 1) * 0.03), `${independentPaths} independent paths reach this node.`);
  if (node.properties.fileKind === "declaration") add("declaration-penalty", -0.12, "Declaration-only context is lower priority than executable source.");
  const score = Number(Math.min(1, Math.max(0, signals.reduce((sum, signal) => sum + signal.contribution, 0))).toFixed(3));
  const productionCaller = !isTestNode(node) && relationships.has("CALLS") && hops <= 2;
  const risk: RiskLevel = isSeed || (productionCaller && (node.properties.exported === true || independentPaths > 1)) ? "High" : score >= 0.6 ? "Medium" : "Low";
  const reason = isSeed
    ? "Direct change seed; inspect before editing."
    : `${hops}-hop ${[...relationships].join(" + ")} evidence${isTestNode(node) ? " reaches a relevant test" : " reaches structurally related code"}.`;
  return { score, risk, signals, reason };
}

