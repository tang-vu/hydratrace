import { NextResponse } from "next/server";
import { z } from "zod";
import { benchmarkCases } from "../../../benchmark/cases";
import { repositoryIdSchema, resolveRegisteredRepository } from "../../../core/repositories/registry";
import { runAnalysis } from "../../../core/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  repository: repositoryIdSchema,
  task: z.string().trim().min(3).max(500),
  budget: z.number().int().min(2_000).max(8_000),
  depth: z.number().int().min(1).max(3),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const result = await runAnalysis({
      repository: resolveRegisteredRepository(input.repository),
      task: input.task,
      budget: input.budget,
      depth: input.depth,
      writeArtifacts: true,
    });
    const benchmarkCase = input.repository === "shopflow" ? benchmarkCases.find((item) => item.task === input.task) : undefined;
    const comparison = benchmarkCase ? (() => {
      const gold = new Set(benchmarkCase.goldFiles.map((item) => item.path));
      const graphFiles = new Set(result.impact.recommendations.map((item) => item.path));
      const lexicalFiles = new Set(result.baseline.map((item) => String(item.path)));
      const graphHits = [...gold].filter((file) => graphFiles.has(file));
      const lexicalHits = [...gold].filter((file) => lexicalFiles.has(file));
      return {
        label: benchmarkCase.id,
        goldFiles: [...gold],
        graphRecall: graphHits.length / gold.size,
        lexicalRecall: lexicalHits.length / gold.size,
        graphHits,
        lexicalHits,
        graphOnly: graphHits.filter((file) => !lexicalFiles.has(file)),
      };
    })() : undefined;
    return NextResponse.json({ ...result, comparison });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return NextResponse.json(
      { error: validation ? error.issues.map((issue) => issue.message).join("; ") : error instanceof Error ? error.message : String(error) },
      { status: validation ? 400 : 500 },
    );
  }
}
