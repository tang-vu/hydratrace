# Hack Hydra submission answers

## Project name

HydraTrace

## Short description

HydraTrace maps a TypeScript repository into HydraDB, traces the multi-hop blast radius of a code change, and emits a token-budgeted Context Pack with a graph path proving every recommendation.

## Problem being addressed

Coding agents usually retrieve files by filename, keywords, embeddings, or recent activity. Those signals miss callers with different names, indirect tests, interface implementations, route-to-service chains, and coordinated runtime dependencies. Developers need to know what is likely to break before an agent edits, and they need evidence rather than opaque confidence.

## What was built

HydraTrace includes a semantic TypeScript/JavaScript indexer, deterministic safe graph identities, synchronized batched HydraDB ingestion, Git diff and natural-language seeding, native bounded path traversal, auditable risk ranking, evidence-oriented recommendations, Markdown/JSON Context Packs, a lexical comparison and seven-case executed benchmark, a pinned external p-limit case study, CLI/doctor workflow, two verified MCP tools for coding agents, a live Next.js graph interface with ShopFlow and HydraTrace dogfood modes, integration tests, and a deterministic demo.

## How HydraDB is used

HydraDB stores the repository’s `Repository`, `File`, `Symbol`, and `ChangeSet` nodes plus typed structural relationships. HydraTrace carries mutation bookmarks into causal reads, synchronizes removed source, and calls native `algo.SSpaths` to retrieve whole one-to-three-hop evidence paths. The live UI and MCP output expose sanitized query IDs, latency, result count, read epoch, and bookmark state. Source snippets are hydrated locally only after HydraDB returns the relevant IDs. There is intentionally no production graph fallback, so HydraDB is required for the core result.

## Tech stack

TypeScript 6, Node.js 24, Next.js 16, React 19, ts-morph, HydraDB HTTP API/OpenCypher/native path procedures, Model Context Protocol SDK, React Flow, Zod, Vitest, Playwright, pnpm, Docker Compose, and GitHub Actions.

## Track

Track 02 — Repos, dependencies and code as graphs; sub-track B — Code graphs for IDE assistants.

## Team members and contributions

- Tang Vu — project concept, product design, architecture, implementation, tests, DevOps, benchmark, documentation, and demo.

## Links

- Public repository: https://github.com/tang-vu/hydratrace
- Live project: https://hydratrace.tangvu.dev
- Demo video: **PASTE UNLISTED YOUTUBE URL HERE**
- Official submission form: https://forms.gle/WEwqEmmN7Bkp4HyJ6

## Final form checklist

- Confirm repository visibility in a signed-out browser.
- Confirm every participant and contribution line.
- Paste the verified video URL and check duration ≤ 3:00.
- Open README setup links and repository license from the public page.
- Submit before August 20, 2026, 11:59 PM PT.
