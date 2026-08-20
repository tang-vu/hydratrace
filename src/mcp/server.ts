#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { runAnalysis } from "../core/service";
import { toAgentContext } from "./context";

const VERSION = "0.2.0";

const analysisInput = {
  repository: z.string().min(1).describe("Absolute or current-working-directory-relative path to a TypeScript/JavaScript repository."),
  task: z.string().min(1).max(4_000).describe("The requested code change or symbol whose blast radius should be traced."),
  base: z.string().min(1).max(256).optional().describe("Optional read-only Git base revision."),
  head: z.string().min(1).max(256).optional().describe("Optional read-only Git head revision."),
  tokenBudget: z.number().int().min(400).max(32_000).default(4_000).describe("Approximate Context Pack token budget."),
  maximumDepth: z.number().int().min(1).max(3).default(3).describe("Maximum HydraDB graph traversal depth."),
};

function toolFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `HydraTrace could not complete the analysis: ${message}` }],
  };
}

export function createHydraTraceMcpServer(): McpServer {
  const server = new McpServer(
    { name: "hydratrace", version: VERSION },
    {
      instructions: "HydraTrace indexes TypeScript/JavaScript repositories into HydraDB and returns bounded, evidence-backed change context. Every recommendation is derived from a real HydraDB path; there is no production fallback graph.",
    },
  );

  server.registerTool(
    "get_change_context",
    {
      title: "Get change context",
      description: "Index a repository into HydraDB, trace the bounded structural blast radius of a task and/or Git diff, and return ranked evidence paths plus a token-budgeted Context Pack.",
      inputSchema: analysisInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ repository, task, base, head, tokenBudget, maximumDepth }) => {
      try {
        const result = await runAnalysis({
          repository,
          task,
          base,
          head,
          includeDiff: Boolean(base || head),
          budget: tokenBudget,
          depth: maximumDepth,
          writeArtifacts: false,
        });
        const structuredContent = toAgentContext(result);
        return {
          content: [{ type: "text", text: structuredContent.contextPack.markdown }],
          structuredContent,
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "explain_symbol_impact",
    {
      title: "Explain symbol impact",
      description: "Resolve a symbol deterministically, traverse its HydraDB relationships, and explain the strongest evidence-backed impacts.",
      inputSchema: {
        repository: analysisInput.repository,
        symbol: z.string().min(1).max(512).describe("Symbol name, qualified name, or repository-relative path to explain."),
        tokenBudget: analysisInput.tokenBudget,
        maximumDepth: analysisInput.maximumDepth,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ repository, symbol, tokenBudget, maximumDepth }) => {
      try {
        const result = await runAnalysis({
          repository,
          task: `Explain the change impact of ${JSON.stringify(symbol)}`,
          budget: tokenBudget,
          depth: maximumDepth,
          includeDiff: false,
          writeArtifacts: false,
        });
        const structuredContent = toAgentContext(result);
        return {
          content: [{ type: "text", text: structuredContent.contextPack.markdown }],
          structuredContent,
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createHydraTraceMcpServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
