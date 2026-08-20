import { afterEach, describe, expect, it, vi } from "vitest";
import type { HydraConfig } from "../src/hydradb/config";
import { HydraDbClient, HydraDbError } from "../src/hydradb/client";

const config: HydraConfig = {
  httpUrl: "http://127.0.0.1:8443",
  adminUrl: "http://127.0.0.1:9090",
  namespace: "test",
  graphId: "test",
  cellId: "cell-0",
  token: "test-token-that-is-at-least-32-characters",
  timeoutMs: 1_000,
};

function response(queryId: string, rows: unknown[][], options: { bookmark?: string; cursor?: number } = {}) {
  return new Response(JSON.stringify({
    query_id: queryId,
    columns: ["value"],
    rows,
    read_epoch: 7,
    next_cursor: options.cursor ?? null,
    bookmark: options.bookmark ?? null,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.restoreAllMocks());

describe("HydraDB HTTP client contracts", () => {
  it("reuses the initial bookmark across cursor pages and decodes all rows", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response("prime", [[{ type: "integer", value: 1 }]], { bookmark: "bookmark-a" }))
      .mockResolvedValueOnce(response("paged", [[{ type: "integer", value: 2 }]], { bookmark: "bookmark-b", cursor: 9 }))
      .mockResolvedValueOnce(response("paged", [[{ type: "integer", value: 3 }]], { bookmark: "bookmark-c" }));
    const client = new HydraDbClient(config);
    await client.query("RETURN 1 AS value", { queryId: "prime" });
    const result = await client.query("RETURN 2 AS value", { queryId: "paged", pageSize: 1 });
    expect(result.rows).toEqual([[2], [3]]);
    expect(result.pages).toBe(2);
    const firstPage = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const secondPage = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(firstPage.bookmark).toBe("bookmark-a");
    expect(secondPage.bookmark).toBe("bookmark-a");
    expect(secondPage.cursor).toBe(9);
    expect(client.latestBookmark).toBe("bookmark-c");
  });

  it("retries 503 responses within a bounded budget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(response("retry", [[{ type: "boolean", value: true }]]));
    const client = new HydraDbClient(config);
    await expect(client.query("RETURN true AS value", { queryId: "retry" })).resolves.toMatchObject({ rows: [[true]] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry network failures and redacts bearer tokens", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error(`cannot use ${config.token}`));
    const client = new HydraDbClient(config);
    await expect(client.query("RETURN 1 AS value", { queryId: "network" })).rejects.toMatchObject({
      code: "unavailable",
      message: expect.not.stringContaining(config.token),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe query identifiers before sending a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const client = new HydraDbClient(config);
    await expect(client.query("RETURN 1 AS value", { queryId: "unsafe id" })).rejects.toBeInstanceOf(HydraDbError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
