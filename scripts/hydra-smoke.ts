import { randomInt } from "node:crypto";
import { HydraDbClient } from "../src/hydradb/client";
import { loadHydraConfig, publicHydraConfig } from "../src/hydradb/config";

const config = loadHydraConfig();
const client = new HydraDbClient(config);
const left = randomInt(1_000_000, 8_000_000);
const right = left + 1;

const write = await client.query(
  "MERGE (a:HydraTraceSmoke {id: $left})-[:PROVES {id: $edge}]->(b:HydraTraceSmoke {id: $right})",
  { queryId: `hydratrace-smoke-write-${left}`, parameters: { left, right, edge: right + 1 }, mutation: true },
);
const read = await client.query(
  "MATCH (a:HydraTraceSmoke {id: $left})-[:PROVES]->(b) RETURN a.id AS source, b.id AS target",
  { queryId: `hydratrace-smoke-read-${left}`, parameters: { left }, consistency: "causal" },
);

if (read.rows.length !== 1 || read.rows[0]?.[0] !== left || read.rows[0]?.[1] !== right) {
  throw new Error(`HydraDB smoke read did not return the written relationship: ${JSON.stringify(read.rows)}`);
}

console.log(JSON.stringify({
  ok: true,
  endpoint: publicHydraConfig(config),
  write: { queryId: write.queryId, latencyMs: write.latencyMs, bookmark: Boolean(write.bookmark) },
  read: { queryId: read.queryId, latencyMs: read.latencyMs, rows: read.rows.length, values: read.rows[0] },
}, null, 2));

