import { describe, expect, it } from "vitest";
import { AnalysisGuard, analysisClientId } from "../src/core/http/analysis-guard";

describe("AnalysisGuard", () => {
  it("allows only the configured number of concurrent analyses", () => {
    const guard = new AnalysisGuard(1, 10, 60_000, () => 1_000);
    const first = guard.tryAcquire("judge-a");
    const second = guard.tryAcquire("judge-b");

    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({ allowed: false, reason: "busy", retryAfterSeconds: 5 });

    first.release();
    expect(guard.tryAcquire("judge-b").allowed).toBe(true);
  });

  it("rate-limits repeated analyses and resets after the window", () => {
    let now = 1_000;
    const guard = new AnalysisGuard(1, 2, 10_000, () => now);

    const first = guard.tryAcquire("judge");
    first.release();
    const second = guard.tryAcquire("judge");
    second.release();
    expect(guard.tryAcquire("judge")).toMatchObject({ allowed: false, reason: "rate-limit", retryAfterSeconds: 10 });

    now = 11_000;
    expect(guard.tryAcquire("judge").allowed).toBe(true);
  });

  it("uses Cloudflare's connecting IP before forwarded or local identifiers", () => {
    const request = new Request("https://hydratrace.example/api/analyze", {
      headers: { "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.2, 127.0.0.1" },
    });
    expect(analysisClientId(request)).toBe("203.0.113.5");
  });
});
