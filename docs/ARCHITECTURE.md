# HydraTrace architecture

## Product boundary

HydraTrace is one strict TypeScript application with four runtime stages: static indexing, HydraDB storage, graph-native impact retrieval, and local context hydration. Next.js and the CLI call the same core service, so the demo does not have a separate or fake data path.

```mermaid
sequenceDiagram
    participant U as CLI / web demo
    participant X as TS indexer
    participant H as HydraDB HTTP
    participant C as Local source cache
    U->>X: Index requested repository
    X->>H: UNWIND node batches (bookmark chain)
    X->>H: UNWIND edge batches (bookmark chain)
    U->>U: Map diff/task to seeds
    U->>H: bounded algo.SSpaths per seed
    H-->>U: tagged whole paths + read epoch
    U->>U: deterministic scoring and deduplication
    U->>C: hydrate only returned IDs
    C-->>U: bounded source snippets
    U-->>U: Markdown + JSON Context Pack
```

## Components

| Component | Responsibility |
|---|---|
| `src/core/indexer` | Safe discovery and ts-morph semantic extraction. |
| `src/core/diff` / `baseline` | Read-only Git hunk mapping and deterministic task signals. |
| `src/hydradb` | Configuration, typed HTTP values, retries, bookmarks, pagination, queries, ingestion. |
| `src/core/impact` | Native traversal orchestration, evidence orientation, ranking. |
| `src/core/context` | Root-confined snippet hydration, deduplication, budget enforcement. |
| `src/core/service` | Shared vertical slice used by CLI and web. |
| `src/app` | Live-only desktop demo; the API only permits bundled ShopFlow. |
| `src/benchmark` | Reproducible fixture evaluation and generated reports. |

## Storage and consistency

Every mutation response bookmark is retained by `HydraDbClient`. Subsequent batches and reads send that bookmark with causal consistency. Cursor pages reuse the query ID, query, parameters, target, principal, initial bookmark, and latest opaque cursor. Strong consistency is supported by the typed client but the local single-node workflow uses causal reads after its writes.

HydraDB remains correct without a separately running graph-indexer worker: current reads combine compiled traversal topology with the visible WAL overlay or canonical adjacency. The demo therefore runs the official `graph-node` only. This is an explicit documented HydraDB architecture property, not a local fallback.

## Failure behavior

- Admin readiness is a preliminary check; only `pnpm hydra:smoke` proves execution.
- HTTP 429 and 503 receive two bounded backoff retries with the same query ID.
- Invalid queries, authentication failures, timeouts, and all other responses fail immediately with sanitized context.
- Pagination column drift fails rather than merging corrupt pages.
- Invalid configuration, an unavailable token file, unsafe paths, missing seeds, or HydraDB unavailability are user-visible errors.
- There is no production in-memory, JSON, SQLite, Kuzu, or Neo4j traversal.

## Security boundaries

The CLI accepts a repository path, canonicalizes it, skips symlinks, ignores build/cache/binary content, and uses `execFile` argument arrays for read-only Git commands. Snippet hydration rechecks both requested and real paths. The browser never receives the bearer token and its API route accepts only the literal `shopflow` selector. User task text stays in local lexical matching and cannot alter Cypher syntax. Graph labels and relationship types are compiled from closed TypeScript unions.

**Without HydraDB, HydraTrace loses its core blast-radius traversal and evidence paths. The local source cache can hydrate snippets but cannot determine impact. There is intentionally no production fallback graph.**
