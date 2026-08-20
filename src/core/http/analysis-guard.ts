const DEFAULT_WINDOW_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_REQUESTS = 6;

interface RateEntry {
  count: number;
  resetAt: number;
}

export interface GuardResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: "busy" | "rate-limit";
  release: () => void;
}

/**
 * A small single-process guard for the public demo. Cloudflare remains the
 * network boundary; this protects the expensive index/traverse operation if
 * the public endpoint is refreshed repeatedly or hit concurrently.
 */
export class AnalysisGuard {
  private readonly requests = new Map<string, RateEntry>();
  private active = 0;

  constructor(
    private readonly maxConcurrent = 1,
    private readonly maxRequests = DEFAULT_MAX_REQUESTS,
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  tryAcquire(clientId: string): GuardResult {
    const timestamp = this.now();
    this.prune(timestamp);

    const current = this.requests.get(clientId);
    const entry = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + this.windowMs }
      : current;

    if (entry.count >= this.maxRequests) {
      return this.denied("rate-limit", Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1_000)));
    }

    if (this.active >= this.maxConcurrent) {
      return this.denied("busy", 5);
    }

    entry.count += 1;
    this.requests.set(clientId, entry);
    this.active += 1;

    let released = false;
    return {
      allowed: true,
      release: () => {
        if (!released) {
          released = true;
          this.active = Math.max(0, this.active - 1);
        }
      },
    };
  }

  private denied(reason: "busy" | "rate-limit", retryAfterSeconds: number): GuardResult {
    return { allowed: false, reason, retryAfterSeconds, release: () => undefined };
  }

  private prune(timestamp: number): void {
    for (const [clientId, entry] of this.requests) {
      if (entry.resetAt <= timestamp) this.requests.delete(clientId);
    }
  }
}

export function analysisClientId(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (cloudflareIp || forwardedIp || "local-or-unknown").slice(0, 128);
}

export const publicAnalysisGuard = new AnalysisGuard();
