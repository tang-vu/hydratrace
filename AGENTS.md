<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HydraTrace contributor guide

## Layout

- `src/app` and `src/components`: Next.js demo and HTTP routes.
- `src/core`: semantic indexing, diff/task seeds, ranking, baselines, and Context Packs.
- `src/hydradb`: the typed HTTP client, compatible query builders, and batched ingestion.
- `src/cli`, `src/benchmark`, `fixtures/shopflow`, `tests`, `scripts`, and `docs`: CLI, evaluation, deterministic demo, verification, automation, and public documentation.

## Commands

```text
pnpm build                 production build
pnpm test                  unit tests
pnpm test:integration      live HydraDB tests
pnpm lint                  ESLint with zero warnings
pnpm typecheck             strict TypeScript check
pnpm benchmark             executed lexical/graph benchmark
pnpm hydra:smoke           authenticated write/read proof
pnpm demo                  prepare HydraDB, verify ShopFlow, and start the UI
pnpm demo:verify           assert the complete non-UI demo path
```

## HydraDB constraints

Use one statement per request; non-negative safe-integer IDs; ID-only `MERGE` followed by `SET`; parameter list-of-map batches only through `UNWIND`; explicit projections; one type per regular relationship pattern; and native paths bounded to one–three hops with explicit `pathCount` and `resultLimit`. Do not use `RETURN *`, unbounded `*`, `IN`, `CONTAINS`, `ENDS WITH`, `IS NULL`, `ON CREATE`, or `ON MATCH`.

There is no runtime graph fallback. Tests may use doubles, but production indexing and impact evidence must fail clearly when HydraDB is unavailable. Never log or return a bearer token.

## Definition of done

A change is done when lint, typecheck, unit tests, the production build, live HydraDB integration, benchmark, and `demo:verify` pass; every impact recommendation has a real HydraDB evidence path; exports remain within budget and repository boundaries; and public documentation stays accurate.
