import { describe, expect, it } from "vitest";
import { stableId } from "../../src/core/graph/ids";
import { EDGE_TYPES, NODE_LABELS } from "../../src/core/graph/model";
import { indexRepository } from "../../src/core/indexer";
import { HydraDbClient, HydraDbError } from "../../src/hydradb/client";
import { loadHydraConfig } from "../../src/hydradb/config";
import { ingestRepository } from "../../src/hydradb/ingest";
import { graphCountQueries, pathTraversalQuery } from "../../src/hydradb/queries";

describe.sequential("live HydraDB integration (no fallback)", () => {
  const config = loadHydraConfig();
  const client = new HydraDbClient(config);
  const prefix = `integration-${Date.now()}-${process.pid}`;
  const source = stableId(`${prefix}:source`);
  const target = stableId(`${prefix}:target`);
  const edge = stableId(`${prefix}:edge`);

  it("performs an authenticated write/read and causal bookmark round trip", async () => {
    const write = await client.query(
      "MERGE (a:HydraTraceIntegration {id: $source})-[:PROVES {id: $edge}]->(b:HydraTraceIntegration {id: $target})",
      { queryId: `${prefix}-write`, parameters: { source, target, edge }, mutation: true },
    );
    expect(write.bookmark).toBeTruthy();
    const read = await client.query(
      "MATCH (a:HydraTraceIntegration {id: $source})-[:PROVES]->(b) RETURN b.id AS target",
      { queryId: `${prefix}-read`, parameters: { source }, consistency: "causal" },
    );
    expect(read.rows).toEqual([[target]]);
    expect(read.readEpoch).toBeTypeOf("number");
  });

  it("batch-upserts vertices and edges idempotently", async () => {
    const index = await indexRepository("fixtures/shopflow");
    const first = await ingestRepository(client, index);
    const second = await ingestRepository(client, index);
    expect(first.nodeCount).toBe(29);
    expect(first.edgeCount).toBe(57);
    expect(second.nodeCount).toBe(first.nodeCount);
    expect(second.edgeCount).toBe(first.edgeCount);
    expect(second.synchronized).toBe(true);
    expect(second.deletedNodeCount).toBe(0);
    expect(second.replacedEdgeCount).toBe(first.edgeCount);
    expect(second.batches.every((batch) => batch.bookmark)).toBe(true);
    let persistedNodes = 0;
    for (const label of NODE_LABELS) {
      const result = await client.query(`MATCH (n:${label} {rootHash: $rootHash}) RETURN count(*) AS itemCount`, {
        queryId: `${prefix}-node-cardinality-${label.toLowerCase()}`,
        parameters: { rootHash: index.rootHash },
        consistency: "causal",
      });
      persistedNodes += Number(result.rows[0]?.[0] ?? 0);
    }
    let persistedEdges = 0;
    for (const type of EDGE_TYPES) {
      const result = await client.query(`MATCH (a)-[r:${type} {rootHash: $rootHash}]->(b) RETURN count(*) AS itemCount`, {
        queryId: `${prefix}-edge-cardinality-${type.toLowerCase()}`,
        parameters: { rootHash: index.rootHash },
        consistency: "causal",
      });
      persistedEdges += Number(result.rows[0]?.[0] ?? 0);
    }
    expect(persistedNodes).toBe(first.nodeCount);
    expect(persistedEdges).toBe(first.edgeCount);
  });

  it("removes stale repository records and restores them on the next full index", async () => {
    const full = await indexRepository("fixtures/shopflow");
    const removed = full.nodes.find((node) => node.label === "Symbol" && node.properties.name === "applyCoupon")!;
    const reduced = {
      ...full,
      indexedAt: new Date(Date.now() + 1).toISOString(),
      nodes: full.nodes.filter((node) => node.id !== removed.id),
      edges: full.edges.filter((item) => item.source !== removed.id && item.target !== removed.id),
    };
    const receipt = await ingestRepository(client, reduced);
    expect(receipt.synchronized).toBe(true);
    expect(receipt.deletedNodeCount).toBe(1);
    expect(receipt.replacedEdgeCount).toBe(full.edges.length);
    const missing = await client.query("MATCH (n:Symbol {id: $id}) RETURN count(*) AS itemCount", {
      queryId: `${prefix}-stale-node-missing`, parameters: { id: removed.id }, consistency: "causal",
    });
    expect(missing.rows).toEqual([[0]]);
    const reducedEdgeCount = await client.query(graphCountQueries().edges, {
      queryId: `${prefix}-stale-edge-cardinality`, parameters: { rootHash: full.rootHash }, consistency: "causal",
    });
    expect(reducedEdgeCount.rows.reduce((sum, row) => sum + Number(row[0] ?? 0), 0)).toBe(reduced.edges.length);

    const restored = { ...full, indexedAt: new Date(Date.now() + 2).toISOString() };
    await ingestRepository(client, restored);
    const present = await client.query("MATCH (n:Symbol {id: $id}) RETURN count(*) AS itemCount", {
      queryId: `${prefix}-stale-node-restored`, parameters: { id: removed.id }, consistency: "causal",
    });
    expect(present.rows).toEqual([[1]]);
  });

  it("returns bounded whole paths from the native procedure", async () => {
    const index = await indexRepository("fixtures/shopflow");
    const coupon = index.nodes.find((node) => node.properties.name === "applyCoupon")!;
    const result = await client.query(pathTraversalQuery(3, 100), {
      queryId: `${prefix}-paths`, parameters: { source: coupon.id }, consistency: "causal",
    });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.some((row) => typeof row[0] === "object" && row[0] !== null && "nodes" in row[0])).toBe(true);
  });

  it("surfaces malformed queries without retrying them", async () => {
    await expect(client.query("RETURN *", { queryId: `${prefix}-malformed` })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an invalid bearer token", async () => {
    const invalid = new HydraDbClient({ ...config, token: "invalid-token-that-is-at-least-32-characters" });
    await expect(invalid.query("MATCH (n:Symbol) RETURN count(*) AS itemCount", { queryId: `${prefix}-auth` })).rejects.toMatchObject({ status: 401 });
  });

  it("fails clearly when HydraDB is unavailable and cannot fall back", async () => {
    const unavailable = new HydraDbClient({ ...config, httpUrl: "http://127.0.0.1:65534", timeoutMs: 100 });
    await expect(unavailable.query("MATCH (n:Symbol) RETURN count(*) AS itemCount", { queryId: `${prefix}-unavailable`, timeoutMs: 100 })).rejects.toBeInstanceOf(HydraDbError);
  });
});
