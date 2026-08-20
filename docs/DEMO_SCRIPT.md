# Three-minute demo script

Target runtime: **2:48**. Keep the browser at 1440×900 or larger and the terminal at 110% text scaling.

## Preflight

```bash
pnpm install
pnpm hydra:prepare
pnpm hydra:up
pnpm hydra:wait
pnpm hydra:smoke
pnpm mcp:verify
pnpm benchmark
pnpm demo:verify
pnpm dev
```

Confirm the UI status says **HydraDB connected**, the default task is `Change applyCoupon rounding behavior`, browser console is clean, `docs/BENCHMARK_RESULTS.md` matches the last run, and the Context Pack downloads open. Close unrelated apps and hide notifications.

## Narration and exact actions

| Time | Screen action | Narration |
|---|---|---|
| 0:00–0:15 | Show title and default task. | “Coding agents find similar code, but routinely miss structurally connected callers, tests, and configuration. That is how a small edit creates a large surprise.” |
| 0:15–0:30 | Point to AST → HydraDB → Context Pack strip. | “HydraTrace turns a TypeScript repository into a HydraDB code graph and shows the blast radius before an agent edits.” |
| 0:30–0:46 | Show connected status, repository selector, and `pnpm demo:index` output if composited. | “ShopFlow produces 29 deterministic nodes and 57 typed edges in the official HydraDB container. The second selector is dogfood: HydraTrace can analyze itself.” |
| 0:46–1:00 | Highlight task and click **Analyze blast radius** once. | “I’m changing `applyCoupon` rounding. HydraTrace selects the exact symbol as the seed—without an LLM.” |
| 1:00–1:34 | Wait for results, click `calculateOrderTotal`, `finalizePurchase`, then `checkoutRoute`. | “HydraDB returns whole bounded paths: the aliased pricing caller, purchase service, and API route three hops away. Every arrow is typed and oriented from stored graph evidence.” |
| 1:34–1:52 | Click `tests/pricing.spec.ts`; show selected evidence. | “It also finds this test structurally, although the task never names the file. Ranking is deterministic: path length, edge type, public surface, test value, and independent evidence.” |
| 1:52–2:10 | Scroll to retrieval comparison. | “On this executed case, graph recall is 83 percent versus 17 percent for lexical. Across seven fixture cases it is 95.2 versus 42.9; lexical remains more precise.” |
| 2:10–2:27 | Show Context Pack budget bar and click **MD**. | “HydraTrace packs only ranked snippets into 4,000 tokens, with risk, reason, and proof attached. Less context, but the right context.” |
| 2:27–2:39 | Show HydraDB proof receipt. | “The receipt is live: native `algo.SSpaths`, query ID, latency, results, causal bookmark, and read epoch.” |
| 2:39–2:50 | Cut to the pre-run `pnpm mcp:verify` output. | “A real MCP handshake exposes this same context through `get_change_context` and `explain_symbol_impact`, directly to coding agents.” |
| 2:50–2:54 | Return to graph/title. | “HydraTrace: see the blast radius before your coding agent edits.” |

## Expected output

The current deterministic fixture has 29 nodes and 57 edges. The default case should select `applyCoupon`, show `checkoutRoute` at three hops, include at least one structural test, report graph/lexical recall of `0.833/0.167`, and export Markdown/JSON under the selected budget. Latencies and Context Pack size vary and must be read from the live UI, never memorized.

## Backup plan

Before recording, capture one full-results screenshot and one close crop of the proof/Context Pack from the verified live page. If Docker is already running but the UI loses status, run `pnpm hydra:smoke` on camera, refresh once, and continue. If the analysis fails, show the honest error panel and restart with `pnpm hydra:up && pnpm hydra:wait`; do not substitute static data.

## Recording and upload

Record 1440p at 30 fps, export H.264, and keep the final cut under three minutes. Check that small query text is legible at 1080p playback and that no token file, terminal secret, personal notification, or unrelated repository is visible. Upload to YouTube as **Unlisted**, open the link in a private window, confirm playback without authentication, and paste the URL into `docs/SUBMISSION.md` and the official form.
