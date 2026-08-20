import { NextResponse } from "next/server";
import { HydraDbClient } from "../../../hydradb/client";
import { loadHydraConfig, publicHydraConfig } from "../../../hydradb/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = loadHydraConfig();
    const client = new HydraDbClient(config);
    if (!(await client.readiness())) {
      return NextResponse.json({ ok: false, error: "HydraDB admin readiness check failed." }, { status: 503 });
    }
    const receipt = await client.query("MATCH (n:Repository) RETURN count(*) AS repositoryCount", {
      queryId: "hydratrace-status-authenticated-read",
      consistency: "causal",
      timeoutMs: 3_000,
    });
    return NextResponse.json({
      ok: true,
      hydra: publicHydraConfig(config),
      authenticated: true,
      repositoryCount: Number(receipt.rows[0]?.[0] ?? 0),
      latencyMs: receipt.latencyMs,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
