import { NextResponse } from "next/server";
import { HydraDbClient } from "../../../hydradb/client";
import { loadHydraConfig, publicHydraConfig } from "../../../hydradb/config";
import { sanitizeWebError } from "../../../core/repositories/public-analysis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = loadHydraConfig();
    const client = new HydraDbClient(config);
    if (!(await client.readiness())) {
      return NextResponse.json(
        { ok: false, error: "HydraDB admin readiness check failed." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const receipt = await client.query("MATCH (n:Repository) RETURN count(*) AS repositoryCount", {
      queryId: "hydratrace-status-authenticated-read",
      consistency: "causal",
      timeoutMs: 3_000,
    });
    return NextResponse.json(
      {
        ok: true,
        hydra: publicHydraConfig(config),
        authenticated: true,
        repositoryCount: Number(receipt.rows[0]?.[0] ?? 0),
        latencyMs: receipt.latencyMs,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: sanitizeWebError(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
