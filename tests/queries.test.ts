import { describe, expect, it } from "vitest";
import {
  edgeUpsertQuery,
  graphCountQueries,
  pathTraversalQuery,
  rootEdgeCountQuery,
  rootEdgesDeleteQuery,
  storedNodeIdsQuery,
  vertexDeleteQuery,
  vertexUpsertQuery,
} from "../src/hydradb/queries";

describe("HydraDB Cypher query contracts", () => {
  it("generates ID-only vertex MERGE followed by explicit SET", () => {
    expect(vertexUpsertQuery("Symbol", ["name", "path"])).toBe("UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Symbol, n.name = row.name, n.path = row.path");
  });

  it("generates typed, labelled, one-hop relationship upserts", () => {
    expect(edgeUpsertQuery("CALLS", "Symbol", "Symbol", ["confidence"])).toBe("UNWIND $rows AS row MATCH (s:Symbol {id: row.source}), (d:Symbol {id: row.target}) MERGE (s)-[r:CALLS {id: row.id}]->(d) SET r.confidence = row.confidence");
  });

  it("always bounds native paths, results, and trusted relationship types", () => {
    const query = pathTraversalQuery(3, 100);
    expect(query).toContain("algo.SSpaths");
    expect(query).toContain("maxLen: 3");
    expect(query).toContain("pathCount: 100");
    expect(query).toContain("resultLimit: 100");
    expect(query).not.toContain("RETURN *");
    expect(() => pathTraversalQuery(4)).toThrow(/depth/);
  });

  it("generates root-scoped stale-record discovery and typed batch deletion", () => {
    expect(storedNodeIdsQuery("Symbol")).toBe("MATCH (n:Symbol {rootHash: $rootHash}) RETURN n.id AS id");
    expect(rootEdgesDeleteQuery("CALLS")).toBe("MATCH (a)-[r:CALLS {rootHash: $rootHash}]->(b) DELETE r");
    expect(rootEdgeCountQuery("CALLS")).toBe("MATCH (a)-[r:CALLS {rootHash: $rootHash}]->(b) RETURN count(*) AS itemCount");
    expect(vertexDeleteQuery()).toBe("UNWIND $rows AS row MATCH (n {id: row.id}) DETACH DELETE n");
  });

  it("counts only explicitly labelled nodes and typed relationships", () => {
    const counts = graphCountQueries();
    expect(counts.nodes).toContain("MATCH (n:Symbol {rootHash: $rootHash}) RETURN count(*) AS itemCount");
    expect(counts.edges).toContain("MATCH (a)-[r:CALLS {rootHash: $rootHash}]->(b) RETURN count(*) AS itemCount");
    expect(`${counts.nodes}${counts.edges}`).not.toContain("RETURN *");
  });
});
