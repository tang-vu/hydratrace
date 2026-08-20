# Benchmark methodology

## Scope

ShopFlow is an original, deterministic TypeScript checkout fixture. It contains domain types, a promotion interface and implementation, a coupon function re-exported under an alias, total calculation, a purchase service, API route, audit side effect, configuration, and three tests.

Seven cases live in `src/benchmark/cases.ts`. Each declares a task, gold relevant files with rationales, and K. Six exercise structural reach; `local-config` intentionally preserves a tie where graph expansion is unnecessary.

## Compared systems

The lexical baseline ranks exact symbol/qualified names, quoted phrases, path segments, and token overlap. It performs no graph expansion. HydraTrace uses the same task seeding signals, then performs bounded native HydraDB traversal and deterministic ranking.

For each result list, the runner deduplicates by repository-relative file before truncating at K. It calculates:

- Recall@K = relevant retrieved / all gold relevant files.
- Precision@K = relevant retrieved / retrieved files.
- file and test hits;
- estimated Context Pack tokens;
- recommendations carrying evidence paths;
- lexical retrieval latency and graph retrieval latency separately;
- indexing and ingestion time outside retrieval.

## Reproduce

```bash
pnpm hydra:prepare
pnpm hydra:up
pnpm hydra:wait
pnpm benchmark
```

Reports are regenerated at `generated/benchmark/report.json` and `.md`; the Markdown snapshot at [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md) is written by the same command. No result number is embedded in the runner.

## Limitations

This is a small product demonstration, not a statistically representative code-retrieval study. Gold labels and source are authored together, K differs by task breadth, token counts are approximate, caches and local load affect timing, and one repository cannot measure language/ecosystem generalization. The high lexical precision reflects its intentionally narrow result sets; HydraDB improves recall by returning more structural context, with lower precision at the chosen K.

