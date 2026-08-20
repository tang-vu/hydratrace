# Three-minute demo script

Target runtime: **2:48**. Keep the browser at 1440×900 or larger and the terminal at 110% text scaling.

## Preflight

```bash
pnpm install
pnpm hydra:prepare
pnpm hydra:up
pnpm hydra:wait
pnpm hydra:smoke
pnpm benchmark
pnpm demo:verify
pnpm dev
```

Confirm the UI status says **HydraDB connected**, the default task is `Change applyCoupon rounding behavior`, browser console is clean, `docs/BENCHMARK_RESULTS.md` matches the last run, and the Context Pack downloads open. Close unrelated apps and hide notifications.

## Narration and exact actions

| Time | Screen action | Narration |
|---|---|---|
| 0:00–0:18 | Show title and default task. | “Coding agents find textually similar code, but routinely miss structurally connected callers, tests, and configuration. That is how a small edit creates a large surprise.” |
| 0:18–0:34 | Point to AST → HydraDB → Context Pack strip. | “HydraTrace turns a TypeScript repository into a HydraDB code graph and shows the blast radius before an agent edits.” |
| 0:34–0:52 | Show connected status, indexed commit, then terminal `pnpm demo:index` output if composited. | “The bundled ShopFlow repository produces 29 deterministic nodes and 57 typed edges. They are written to the official HydraDB container in label- and type-grouped batches.” |
| 0:52–1:07 | Highlight task and click **Analyze blast radius** once. | “I’m changing `applyCoupon` rounding. HydraTrace selects the exact symbol as the seed—without an LLM.” |
| 1:07–1:42 | Wait for results, click `calculateOrderTotal`, then `finalizePurchase`, then `checkoutRoute`. | “HydraDB returns whole bounded paths. Here is the aliased pricing caller, then the purchase service, then the API route three hops away. Every arrow is typed and oriented from stored graph evidence.” |
| 1:42–2:02 | Click `tests/pricing.spec.ts`; show selected evidence. | “It also finds this pricing test structurally, even though the task never names that file. The score is deterministic: path length, dependency type, public surface, test value, and independent evidence.” |
| 2:02–2:20 | Scroll to retrieval comparison. | “On the executed gold-labeled case, graph recall is 83 percent versus 17 percent for lexical retrieval. Across seven fixture cases it is 95.2 versus 42.9 percent; lexical remains more precise.” |
| 2:20–2:36 | Show Context Pack budget bar, preview, and click **MD**. | “HydraTrace packs only ranked snippets into a 4,000-token budget, with risk, reason, and evidence attached. The agent gets less context, but the right context.” |
| 2:36–2:44 | Show HydraDB proof receipt. | “This receipt is live: native `algo.SSpaths`, query ID, latency, returned paths, causal bookmark, and read epoch.” |
| 2:44–2:48 | Return to graph/title. | “HydraTrace: see the blast radius before your coding agent edits.” |

## Expected output

The current deterministic fixture has 29 nodes and 57 edges. The default case should select `applyCoupon`, show `checkoutRoute` at three hops, include at least one structural test, report graph/lexical recall of `0.833/0.167`, and export Markdown/JSON under the selected budget. Latencies and Context Pack size vary and must be read from the live UI, never memorized.

## Backup plan

Before recording, capture one full-results screenshot and one close crop of the proof/Context Pack from the verified live page. If Docker is already running but the UI loses status, run `pnpm hydra:smoke` on camera, refresh once, and continue. If the analysis fails, show the honest error panel and restart with `pnpm hydra:up && pnpm hydra:wait`; do not substitute static data.

## Recording and upload

Record 1440p at 30 fps, export H.264, and keep the final cut under three minutes. Check that small query text is legible at 1080p playback and that no token file, terminal secret, personal notification, or unrelated repository is visible. Upload to YouTube as **Unlisted**, open the link in a private window, confirm playback without authentication, and paste the URL into `docs/SUBMISSION.md` and the official form.

