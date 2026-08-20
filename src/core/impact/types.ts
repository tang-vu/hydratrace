import type { GraphNode } from "../graph/model";

export interface ChangeSeed {
  node: GraphNode;
  source: "diff" | "task";
  confidence: number;
  reason: string;
}

export interface EvidenceRelationship {
  id?: number;
  type: string;
  source: number;
  target: number;
}

export interface EvidencePath {
  seedId: number;
  nodeIds: number[];
  relationships: EvidenceRelationship[];
  cost: number;
}

export interface ScoreSignal {
  signal: string;
  contribution: number;
  explanation: string;
}

export type RiskLevel = "High" | "Medium" | "Low";

export interface ImpactRecommendation {
  node: GraphNode;
  path: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
  score: number;
  risk: RiskLevel;
  evidence: EvidencePath;
  evidenceText: string;
  reason: string;
  scoreSignals: ScoreSignal[];
  isTest: boolean;
  foundByBaseline: boolean;
  estimatedTokens: number;
  independentPathCount: number;
}

export interface QueryReceipt {
  queryId: string;
  query: string;
  latencyMs: number;
  resultCount: number;
  pageCount: number;
  bookmarkUsed: boolean;
  readEpoch?: number;
}

export interface ImpactAnalysis {
  seeds: ChangeSeed[];
  recommendations: ImpactRecommendation[];
  paths: EvidencePath[];
  baselineNodeIds: number[];
  queryReceipts: QueryReceipt[];
  graphCounts: { nodes: number; edges: number };
  depth: number;
  lowConfidence: boolean;
}

