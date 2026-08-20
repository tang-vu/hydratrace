import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

const resultSchema = z.object({
  repository: z.object({ root: z.string(), commit: z.string() }),
  hydra: z.object({ namespace: z.string(), graphId: z.string() }),
  analysis: z.object({
    graphCounts: z.object({ nodes: z.number(), edges: z.number() }),
    seeds: z.array(z.object({ id: z.number(), path: z.string() })).min(1),
    recommendations: z.array(z.object({
      id: z.number(),
      path: z.string(),
      evidencePath: z.string().min(1),
      evidence: z.object({ seedId: z.number(), relationships: z.array(z.unknown()) }),
    })).min(2),
    queryReceipts: z.array(z.object({ queryId: z.string(), resultCount: z.number() })).min(1),
  }),
  contextPack: z.object({ markdown: z.string().min(100), estimatedTokens: z.number(), analysis: z.object({ budget: z.number() }) }),
});

const root = path.resolve(".");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "src", "mcp", "server.ts")],
  cwd: root,
  stderr: "pipe",
});
const client = new Client({ name: "hydratrace-verifier", version: "0.1.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  if (names.join(",") !== "explain_symbol_impact,get_change_context") {
    throw new Error(`Unexpected MCP tools: ${names.join(", ")}`);
  }
  const response = await client.callTool({
    name: "get_change_context",
    arguments: {
      repository: path.join(root, "fixtures", "shopflow"),
      task: "Change applyCoupon and find checkout callers and tests",
      tokenBudget: 2_000,
      maximumDepth: 3,
    },
  });
  if (response.isError) throw new Error("get_change_context returned an MCP tool error.");
  if (typeof response.structuredContent === "object" && response.structuredContent !== null && "index" in response.structuredContent) {
    throw new Error("MCP leaked the full repository index into agent context.");
  }
  const parsed = resultSchema.parse(response.structuredContent);
  if (parsed.contextPack.estimatedTokens > parsed.contextPack.analysis.budget) {
    throw new Error("MCP Context Pack exceeded its declared budget.");
  }
  const seedIds = new Set(parsed.analysis.seeds.map((seed) => seed.id));
  const impacted = parsed.analysis.recommendations.filter((item) => !seedIds.has(item.id));
  if (impacted.length === 0 || impacted.some((item) => item.evidence.relationships.length === 0)) {
    throw new Error("MCP returned a non-seed recommendation without a HydraDB evidence relationship.");
  }
  const explanation = await client.callTool({
    name: "explain_symbol_impact",
    arguments: {
      repository: path.join(root, "fixtures", "shopflow"),
      symbol: "applyCoupon",
      tokenBudget: 1_200,
      maximumDepth: 2,
    },
  });
  if (explanation.isError) throw new Error("explain_symbol_impact returned an MCP tool error.");
  const explained = resultSchema.parse(explanation.structuredContent);
  if (!explained.analysis.seeds.some((seed) => seed.path === "src/pricing/coupon.ts")) {
    throw new Error("explain_symbol_impact did not resolve applyCoupon to its source file.");
  }
  console.log(`PASS  MCP handshake and tool discovery (${names.join(", ")})`);
  console.log(`PASS  get_change_context returned ${parsed.analysis.recommendations.length} evidence-backed recommendations`);
  console.log(`PASS  explain_symbol_impact resolved applyCoupon with ${explained.analysis.queryReceipts.length} HydraDB receipts`);
  console.log(`PASS  Context Pack ${parsed.contextPack.estimatedTokens}/${parsed.contextPack.analysis.budget} estimated tokens`);
  console.log(`PASS  HydraDB receipts ${parsed.analysis.queryReceipts.length}; graph ${parsed.analysis.graphCounts.nodes} nodes / ${parsed.analysis.graphCounts.edges} edges`);
} finally {
  await client.close();
}
