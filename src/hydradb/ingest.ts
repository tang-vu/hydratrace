import { createHash, randomUUID } from "node:crypto";
import { EDGE_TYPES, NODE_LABELS, type GraphEdge, type GraphNode, type IndexedRepository, type NodeLabel, type EdgeType } from "../core/graph/model";
import type { HydraDbClient, HydraQueryResult } from "./client";
import {
  edgeUpsertQuery,
  rowsForEdges,
  rowsForNodes,
  rootEdgeCountQuery,
  storedNodeIdsQuery,
  rootEdgesDeleteQuery,
  vertexDeleteQuery,
  vertexUpsertQuery,
} from "./queries";

export interface IngestionReceipt {
  nodeCount: number;
  edgeCount: number;
  deletedNodeCount: number;
  replacedEdgeCount: number;
  synchronized: boolean;
  batches: Array<{
    queryId: string;
    kind: "nodes" | "edges" | "delete-nodes" | "delete-edges";
    type: string;
    count: number;
    latencyMs: number;
    bookmark: boolean;
  }>;
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
  kind: IngestionReceipt["batches"][number]["kind"], type: string,
  executionTag: string,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += 250) {
    const rows = values.slice(offset, offset + 250);
    const payloadHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 12);
    const queryId = `${prefix}-${executionTag}-${String(offset / 250 + 1).padStart(3, "0")}-${payloadHash}`;
    let result: HydraQueryResult;
    try {
      result = await client.query(query, { queryId, parameters: { rows }, mutation: true });
    } catch (error) {
      throw new Error(`HydraDB ${kind} batch ${queryId} failed for ${rows.length} ${type} records.`, { cause: error });
    }
    receipt.batches.push({ queryId, kind, type, count: rows.length, latencyMs: result.latencyMs, bookmark: Boolean(result.bookmark) });
  }
}

function storedIds(result: HydraQueryResult, type: string): number[] {
  return result.rows.map((row) => {
    const id = Number(row[0]);
    if (!Number.isSafeInteger(id) || id < 0) throw new Error(`HydraDB returned an unsafe ${type} ID: ${String(row[0])}.`);
    return id;
  });
}

async function synchronizeRepository(
  client: HydraDbClient,
  index: IndexedRepository,
  receipt: IngestionReceipt,
  executionTag: string,
): Promise<void> {
  for (const type of EDGE_TYPES) {
    const count = await client.query(rootEdgeCountQuery(type), {
      queryId: `hydratrace-sync-count-edges-${type.toLowerCase()}-${index.rootHash.slice(0, 12)}`,
      parameters: { rootHash: index.rootHash },
      consistency: "causal",
    });
    const existing = Number(count.rows[0]?.[0] ?? 0);
    if (!Number.isSafeInteger(existing) || existing < 0) throw new Error(`HydraDB returned an invalid ${type} edge count.`);
    if (existing > 0) {
      const queryId = `hydratrace-sync-replace-${type.toLowerCase()}-${executionTag}`;
      const result = await client.query(rootEdgesDeleteQuery(type), {
        queryId,
        parameters: { rootHash: index.rootHash },
        mutation: true,
      });
      receipt.batches.push({
        queryId,
        kind: "delete-edges",
        type,
        count: existing,
        latencyMs: result.latencyMs,
        bookmark: Boolean(result.bookmark),
      });
      receipt.replacedEdgeCount += existing;
    }
  }

  const currentNodeIds = new Set(index.nodes.map((node) => node.id));
  for (const label of NODE_LABELS) {
    const result = await client.query(storedNodeIdsQuery(label), {
      queryId: `hydratrace-sync-read-nodes-${label.toLowerCase()}-${index.rootHash.slice(0, 12)}`,
      parameters: { rootHash: index.rootHash },
      consistency: "causal",
    });
    const stale = storedIds(result, `${label} node`).filter((id) => !currentNodeIds.has(id));
    await executeBatches(
      client,
      vertexDeleteQuery(),
      `hydratrace-sync-delete-${label.toLowerCase()}`,
      stale.map((id) => ({ id })),
      receipt,
      "delete-nodes",
      label,
      executionTag,
    );
    receipt.deletedNodeCount += stale.length;
  }
}

export async function ingestRepository(client: HydraDbClient, index: IndexedRepository): Promise<IngestionReceipt> {
  // HydraDB deduplicates mutations by query_id. A per-run nonce lets a later
  // index repair externally removed data while retries inside one query call
  // still reuse the same identifier safely.
  const executionTag = randomUUID().replaceAll("-", "").slice(0, 10);
  const receipt: IngestionReceipt = {
    nodeCount: index.nodes.length,
    edgeCount: index.edges.length,
    deletedNodeCount: 0,
    replacedEdgeCount: 0,
    synchronized: false,
    batches: [],
  };
  for (const [label, nodes] of groupBy<GraphNode, NodeLabel>(index.nodes, (node) => node.label)) {
    const expected = propertyNames(nodes);
    if (!nodes.every((node) => propertyNames([node]).join("\0") === expected.join("\0"))) {
      throw new Error(`Node properties are not uniform within ${label}; HydraDB UNWIND rows must be uniform.`);
    }
    await executeBatches(client, vertexUpsertQuery(label, expected), `hydratrace-upsert-${label.toLowerCase()}`, rowsForNodes(nodes), receipt, "nodes", label, executionTag);
  }
  await synchronizeRepository(client, index, receipt, executionTag);
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
        rowsForEdges(endpointEdges), receipt, "edges", type, executionTag,
      );
    }
  }
  receipt.synchronized = true;
  index.diagnostics.nodesWritten = receipt.nodeCount;
  index.diagnostics.edgesWritten = receipt.edgeCount;
  return receipt;
}
