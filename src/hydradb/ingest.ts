import { createHash } from "node:crypto";
import type { GraphEdge, GraphNode, IndexedRepository, NodeLabel, EdgeType } from "../core/graph/model";
import type { HydraDbClient, HydraQueryResult } from "./client";
import { edgeUpsertQuery, rowsForEdges, rowsForNodes, vertexUpsertQuery } from "./queries";

export interface IngestionReceipt {
  nodeCount: number;
  edgeCount: number;
  batches: Array<{ queryId: string; kind: "nodes" | "edges"; type: string; count: number; latencyMs: number; bookmark: boolean }>;
}

function groupBy<T, K extends string>(values: T[], key: (value: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) groups.set(key(value), [...(groups.get(key(value)) ?? []), value]);
  return groups;
}

function propertyNames(values: Array<GraphNode | GraphEdge>): string[] {
  const first = values[0];
  if (!first) return [];
  return Object.keys(first.properties).sort();
}

async function executeBatches(
  client: HydraDbClient, query: string, prefix: string,
  values: Array<Record<string, string | number | boolean>>, receipt: IngestionReceipt,
  kind: "nodes" | "edges", type: string,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += 250) {
    const rows = values.slice(offset, offset + 250);
    const payloadHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 12);
    const queryId = `${prefix}-${String(offset / 250 + 1).padStart(3, "0")}-${payloadHash}`;
    let result: HydraQueryResult;
    try {
      result = await client.query(query, { queryId, parameters: { rows }, mutation: true });
    } catch (error) {
      throw new Error(`HydraDB ${kind} batch ${queryId} failed for ${rows.length} ${type} records.`, { cause: error });
    }
    receipt.batches.push({ queryId, kind, type, count: rows.length, latencyMs: result.latencyMs, bookmark: Boolean(result.bookmark) });
  }
}

export async function ingestRepository(client: HydraDbClient, index: IndexedRepository): Promise<IngestionReceipt> {
  const receipt: IngestionReceipt = { nodeCount: index.nodes.length, edgeCount: index.edges.length, batches: [] };
  for (const [label, nodes] of groupBy<GraphNode, NodeLabel>(index.nodes, (node) => node.label)) {
    const expected = propertyNames(nodes);
    if (!nodes.every((node) => propertyNames([node]).join("\0") === expected.join("\0"))) {
      throw new Error(`Node properties are not uniform within ${label}; HydraDB UNWIND rows must be uniform.`);
    }
    await executeBatches(client, vertexUpsertQuery(label, expected), `hydratrace-upsert-${label.toLowerCase()}`, rowsForNodes(nodes), receipt, "nodes", label);
  }
  for (const [type, edges] of groupBy<GraphEdge, EdgeType>(index.edges, (edge) => edge.type)) {
    const expected = propertyNames(edges);
    if (!edges.every((edge) => propertyNames([edge]).join("\0") === expected.join("\0"))) {
      throw new Error(`Edge properties are not uniform within ${type}; HydraDB UNWIND rows must be uniform.`);
    }
    const nodeById = new Map(index.nodes.map((node) => [node.id, node]));
    const endpoints = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
      const sourceLabel = nodeById.get(edge.source)?.label;
      const targetLabel = nodeById.get(edge.target)?.label;
      if (!sourceLabel || !targetLabel) throw new Error(`Edge ${edge.id} has an unknown endpoint.`);
      const key = `${sourceLabel}:${targetLabel}`;
      endpoints.set(key, [...(endpoints.get(key) ?? []), edge]);
    }
    for (const [endpointKey, endpointEdges] of endpoints) {
      const [sourceLabel, targetLabel] = endpointKey.split(":") as [NodeLabel, NodeLabel];
      await executeBatches(
        client,
        edgeUpsertQuery(type, sourceLabel, targetLabel, expected),
        `hydratrace-upsert-${type.toLowerCase()}-${sourceLabel.toLowerCase()}-${targetLabel.toLowerCase()}`,
        rowsForEdges(endpointEdges), receipt, "edges", type,
      );
    }
  }
  index.diagnostics.nodesWritten = receipt.nodeCount;
  index.diagnostics.edgesWritten = receipt.edgeCount;
  return receipt;
}
