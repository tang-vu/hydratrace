import { NextResponse } from "next/server";
import { z } from "zod";
import { benchmarkCases } from "../../../benchmark/cases";
import { analysisClientId, publicAnalysisGuard } from "../../../core/http/analysis-guard";
import { sanitizeAnalysisForWeb, sanitizeWebError } from "../../../core/repositories/public-analysis";
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
  const permit = publicAnalysisGuard.tryAcquire(analysisClientId(request));
  if (!permit.allowed) {
    return NextResponse.json(
      {
        error: permit.reason === "busy"
          ? "Another analysis is already running. Retry shortly."
          : "Analysis rate limit reached. Retry after the indicated delay.",
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(permit.retryAfterSeconds ?? 5),
        },
      },
    );
  }

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
    const publicResult = sanitizeAnalysisForWeb(result, input.repository);
    return NextResponse.json({ ...publicResult, comparison }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return NextResponse.json(
      { error: validation ? error.issues.map((issue) => issue.message).join("; ") : sanitizeWebError(error) },
      { status: validation ? 400 : 500, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    permit.release();
  }
}
