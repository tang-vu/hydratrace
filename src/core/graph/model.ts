export const NODE_LABELS = ["Repository", "File", "Symbol", "ChangeSet"] as const;
export const EDGE_TYPES = [
  "CONTAINS",
  "DEFINES",
  "IMPORTS",
  "CALLS",
  "EXTENDS",
  "IMPLEMENTS",
  "TESTS",
  "TOUCHES",
] as const;

export type NodeLabel = (typeof NODE_LABELS)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type Scalar = string | number | boolean;

export interface GraphNode {
  id: number;
  label: NodeLabel;
  canonicalKey: string;
  properties: Record<string, Scalar>;
}

export interface GraphEdge {
  id: number;
  type: EdgeType;
  source: number;
  target: number;
  properties: Record<string, Scalar>;
}

export interface SourceLocation {
  path: string;
  startLine: number;
  endLine: number;
}

export interface IndexedRepository {
  schemaVersion: 1;
  root: string;
  rootHash: string;
  repository: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  diagnostics: IndexDiagnostics;
  indexedAt: string;
  indexedCommit: string;
}

export interface IndexDiagnostics {
  filesScanned: number;
  filesExcluded: number;
  symbolsExtracted: number;
  importsResolved: number;
  importsUnresolved: number;
  callsResolved: number;
  callsUnresolved: number;
  testsDetected: number;
  nodesWritten: number;
  edgesWritten: number;
  elapsedMs: number;
  warnings: string[];
}

export function nodePath(node: GraphNode): string | undefined {
  const value = node.properties.path;
  return typeof value === "string" ? value : undefined;
}

export function isTestNode(node: GraphNode): boolean {
  return node.properties.fileKind === "test" || node.properties.kind === "test";
}

