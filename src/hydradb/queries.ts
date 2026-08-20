import { EDGE_TYPES, NODE_LABELS, type EdgeType, type GraphEdge, type GraphNode, type NodeLabel } from "../core/graph/model";

const labelSet = new Set<NodeLabel>(["Repository", "File", "Symbol", "ChangeSet"]);
const edgeSet = new Set<EdgeType>(["CONTAINS", "DEFINES", "IMPORTS", "CALLS", "EXTENDS", "IMPLEMENTS", "TESTS", "TOUCHES"]);

function identifier(value: NodeLabel | EdgeType): string {
  if (!labelSet.has(value as NodeLabel) && !edgeSet.has(value as EdgeType)) throw new Error(`Unsafe graph identifier: ${value}`);
  return value;
}

export function vertexUpsertQuery(label: NodeLabel, propertyNames: string[]): string {
  const safeLabel = identifier(label);
  const properties = [...new Set(propertyNames)].filter((name) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)).sort();
  if (properties.length !== new Set(propertyNames).size) throw new Error("Unsafe or duplicate vertex property name.");
  const assignments = properties.map((name) => `n.${name} = row.${name}`).join(", ");
  return `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:${safeLabel}${assignments ? `, ${assignments}` : ""}`;
}

export function edgeUpsertQuery(type: EdgeType, sourceLabel: NodeLabel, targetLabel: NodeLabel, propertyNames: string[]): string {
  const safeType = identifier(type);
  const safeSourceLabel = identifier(sourceLabel);
  const safeTargetLabel = identifier(targetLabel);
  const properties = [...new Set(propertyNames)].filter((name) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)).sort();
  if (properties.length !== new Set(propertyNames).size) throw new Error("Unsafe or duplicate edge property name.");
  const assignments = properties.map((name) => `r.${name} = row.${name}`).join(", ");
  return `UNWIND $rows AS row MATCH (s:${safeSourceLabel} {id: row.source}), (d:${safeTargetLabel} {id: row.target}) MERGE (s)-[r:${safeType} {id: row.id}]->(d)${assignments ? ` SET ${assignments}` : ""}`;
}

export function storedNodeIdsQuery(label: NodeLabel): string {
  return `MATCH (n:${identifier(label)} {rootHash: $rootHash}) RETURN n.id AS id`;
}

export function vertexDeleteQuery(): string {
  return "UNWIND $rows AS row MATCH (n {id: row.id}) DETACH DELETE n";
}

export function rootEdgesDeleteQuery(type: EdgeType): string {
  return `MATCH (a)-[r:${identifier(type)} {rootHash: $rootHash}]->(b) DELETE r`;
}

export function rootEdgeCountQuery(type: EdgeType): string {
  return `MATCH (a)-[r:${identifier(type)} {rootHash: $rootHash}]->(b) RETURN count(*) AS itemCount`;
}

export function pathTraversalQuery(depth: number, pathCount = 100): string {
  if (!Number.isInteger(depth) || depth < 1 || depth > 3) throw new Error("Traversal depth must be an integer from 1 to 3.");
  if (!Number.isInteger(pathCount) || pathCount < 1 || pathCount > 200) throw new Error("Path count must be between 1 and 200.");
  return `CALL algo.SSpaths({sourceNode: $source, relTypes: ['CALLS', 'IMPORTS', 'TESTS', 'EXTENDS', 'IMPLEMENTS', 'DEFINES'], relDirection: 'both', maxLen: ${depth}, pathCount: ${pathCount}, resultLimit: ${pathCount}}) YIELD path, pathCost RETURN path, pathCost`;
}

export function graphCountQueries() {
  return {
    nodes: NODE_LABELS.map((label) => `MATCH (n:${label} {rootHash: $rootHash}) RETURN count(*) AS itemCount`).join(" UNION ALL "),
    edges: EDGE_TYPES.map((type) => `MATCH (a)-[r:${type} {rootHash: $rootHash}]->(b) RETURN count(*) AS itemCount`).join(" UNION ALL "),
  };
}

export function rowsForNodes(nodes: GraphNode[]) {
  return nodes.map((node) => ({ id: node.id, ...node.properties }));
}

export function rowsForEdges(edges: GraphEdge[]) {
  return edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, ...edge.properties }));
}
