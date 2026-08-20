import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { HydraConfig } from "./config";
import { decodeHydraValue, type HydraValue, type TaggedHydraValue } from "./values";

export type HydraParameters = Record<string, string | number | boolean | Array<Record<string, string | number | boolean>>>;

export interface HydraQueryOptions {
  queryId: string;
  parameters?: HydraParameters;
  consistency?: "causal" | "strong";
  mutation?: boolean;
  pageSize?: number;
  timeoutMs?: number;
}

export interface HydraQueryResult {
  queryId: string;
  columns: string[];
  rows: HydraValue[][];
  bookmark?: string;
  readEpoch?: number;
  latencyMs: number;
  pages: number;
}

const responseSchema = z.object({
  query_id: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.object({ type: z.string(), value: z.unknown().optional() }))),
  read_epoch: z.number().int().nonnegative().nullable().optional(),
  next_cursor: z.number().int().nonnegative().nullable().optional(),
  bookmark: z.string().nullable().optional(),
});

export class HydraDbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HydraDbError";
  }
}

export function isTransientStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export class HydraDbClient {
  private bookmark?: string;

  constructor(private readonly config: HydraConfig) {}

  get latestBookmark() { return this.bookmark; }

  async readiness(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.adminUrl}/readyz`, {
        signal: AbortSignal.timeout(Math.min(this.config.timeoutMs, 3_000)),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async query(query: string, options: HydraQueryOptions): Promise<HydraQueryResult> {
    if (!/^[a-zA-Z0-9._-]+$/.test(options.queryId)) {
      throw new HydraDbError(`HydraDB query ID contains an unsafe key component: ${options.queryId}`, undefined, "invalid_query_id");
    }
    const started = performance.now();
    const rows: HydraValue[][] = [];
    let columns: string[] = [];
    let readEpoch: number | undefined;
    let cursor: number | undefined;
    let pages = 0;
    const requestBookmark = this.bookmark;

    do {
      const body = {
        cell_id: this.config.cellId,
        query,
        query_id: options.queryId,
        parameters: options.parameters ?? {},
        bookmark: requestBookmark,
        timeout_ms: options.timeoutMs ?? this.config.timeoutMs,
        page_size: options.pageSize ?? 500,
        cursor,
        consistency: options.consistency ?? "causal",
      };
      const response = await this.requestWithRetry(body);
      const decoded = responseSchema.parse(await response.json());
      pages += 1;
      if (columns.length > 0 && columns.join("\0") !== decoded.columns.join("\0")) {
        throw new HydraDbError("HydraDB returned different columns between cursor pages.");
      }
      columns = decoded.columns;
      rows.push(...decoded.rows.map((row) => row.map((value) => decodeHydraValue(value as TaggedHydraValue))));
      readEpoch = decoded.read_epoch ?? readEpoch;
      this.bookmark = decoded.bookmark ?? this.bookmark;
      cursor = decoded.next_cursor ?? undefined;
    } while (cursor !== undefined);

    return {
      queryId: options.queryId,
      columns,
      rows,
      bookmark: this.bookmark,
      readEpoch,
      latencyMs: Number((performance.now() - started).toFixed(2)),
      pages,
    };
  }

  private async requestWithRetry(body: Record<string, unknown>): Promise<Response> {
    const endpoint = `${this.config.httpUrl}/v1/graphs/${encodeURIComponent(this.config.graphId)}/query`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            "X-Graph-Namespace": this.config.namespace,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Number(body.timeout_ms) + 1_000),
        });
        if (response.ok) return response;
        const raw = await response.text();
        let message = raw;
        let code: string | undefined;
        try {
          const envelope = JSON.parse(raw) as { error?: { code?: string; message?: string } };
          message = envelope.error?.message ?? raw;
          code = envelope.error?.code;
        } catch { /* preserve raw response */ }
        message = message.replaceAll(this.config.token, "[REDACTED]");
        if (isTransientStatus(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt)));
          continue;
        }
        throw new HydraDbError(`HydraDB query failed (${response.status}${code ? ` ${code}` : ""}): ${message}`, response.status, code);
      } catch (error) {
        if (error instanceof HydraDbError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new HydraDbError(
          `HydraDB is unavailable at ${this.config.httpUrl}: ${message.replaceAll(this.config.token, "[REDACTED]")}`,
          undefined,
          "unavailable",
          { cause: error },
        );
      }
    }
    throw new HydraDbError("HydraDB retry budget was exhausted.");
  }
}
