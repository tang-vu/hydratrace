# Three-minute demo script

Primary demo URL: `https://hydratrace.tangvu.dev`. Keep the local `pnpm demo` workflow ready as the offline fallback.

The verified produced cut is **2:29.267** at 1920×1080 and 30 fps. It leaves more than 30 seconds of margin below the three-minute limit. The canonical narration and capture plan live in `scripts/video/plan.ts`; the generated MP4 is intentionally ignored at `generated/video/hydratrace-demo-final.mp4`.

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
pnpm video:capture
pnpm video:voice
pnpm video:render
pnpm video:verify
```

Confirm the UI says **HydraDB connected**, the default task is `Change applyCoupon rounding behavior`, the browser console is clean, and `docs/BENCHMARK_RESULTS.md` matches the latest executed report. `video:voice` requires the locally DPAPI-protected MiMo key described in [video production](VIDEO_PRODUCTION.md); it never enters the application runtime.

## Verified cut and exact narration

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:06 | Branded title | “Before your coding agent edits, Hydra Trace shows exactly what can break, and why.” |
| 0:06–0:19 | Live product hero and task | “Coding agents are excellent at locating text that looks relevant. The dangerous misses are structural: a caller reached through an import alias, an indirect test, an interface contract, or an API route three hops downstream.” |
| 0:19–0:35 | Executed analysis overview | “Hydra Trace compiles TypeScript and JavaScript semantics into the Hydra database. A task or Git diff selects deterministic change seeds, then bounded native graph traversal retrieves the blast radius. There is intentionally no alternative graph database, and no language model in the critical path.” |
| 0:35–0:50 | Seed and graph counts | “Here, the synthetic Shop Flow repository becomes twenty-nine stable nodes and fifty-seven typed edges. The task changes apply coupon rounding. Exact symbol matching selects apply coupon as the seed with auditable confidence.” |
| 0:50–1:03 | Aliased caller path | “The Hydra database returns whole evidence paths. Calculate order total calls the changed function through a re-exported alias. Finalize purchase depends on that result. Every arrow is typed, bounded, and returned from the stored graph.” |
| 1:03–1:19 | Three-hop API route | “The checkout A P I route sits three hops away. Selecting the recommendation highlights the exact chain from apply coupon, through calculate order total and finalize purchase, to the API boundary. That path is the proof for why this file belongs in the blast radius.” |
| 1:19–1:37 | Structurally found test | “The task never names a test file. Hydra Trace still finds totals cannot become negative through the call graph. Ranking stays explainable: shorter paths, public surfaces, downstream production callers, tests, and independent evidence each contribute a visible score.” |
| 1:37–1:55 | Retrieval comparison and Context Pack | “On this executed case, graph recall is eighty-three percent, versus seventeen percent for the same lexical signals. Across seven deterministic cases, graph recall is ninety-five point two percent. Hydra Trace then spends the four-thousand-token budget on ranked snippets, each carrying its risk, reason, and evidence path.” |
| 1:55–2:10 | HydraDB execution receipt | “This is not a staged graph. The proof panel shows the live Hydra database single-source path procedure, its query identifier, latency, result count, causal bookmark, read epoch, and the twenty-nine-node, fifty-seven-edge graph stored in the Hydra database.” |
| 2:10–2:22 | Real MCP verification output | “The same verified result is available through a real Model Context Protocol handshake. Get change context returns evidence-backed recommendations and a bounded Context Pack directly to coding agents.” |
| 2:22–2:29 | Closing card | “Hydra Trace. Less context, but the right context, with proof before the edit.” |

## Expected evidence

The deterministic ShopFlow run has 29 nodes and 57 edges. It selects `applyCoupon`, reaches `checkoutRoute` at three hops, includes structurally discovered tests, reports graph/lexical recall of `0.833/0.167` for the selected case, and exports Markdown/JSON within the 4,000-token budget. Latency, query IDs, bookmarks, and Context Pack size come from the live run and must never be memorized or replaced with static values.

The verified final artifact has:

- duration: 149.267 seconds;
- H.264 video, 1920×1080, 30 fps;
- AAC mono audio at 48 kHz;
- MiMo ASR word error rate: 1.07%;
- integrated loudness: −16.71 LUFS;
- true peak: −1.41 dBFS;
- loudness range: 3.4 LU.

## Backup plan

Keep the verified final MP4, silent preview, contact sheet, and the live local app on the recording host. If the public tunnel is unavailable, show the same local application at the URL printed by `pnpm demo`. If analysis fails, show the honest error panel and restore HydraDB with `pnpm hydra:up` followed by `pnpm hydra:wait`; never substitute mock graph data.

## Human review and upload

Watch the final MP4 end to end with headphones. Confirm the pronunciations of HydraTrace, HydraDB, TypeScript, ShopFlow, the symbol names, and Model Context Protocol; automated ASR is a quality signal, not a substitute for listening. Check captions at 1080p, verify no notification or unrelated window appears, and confirm the public URL is visible.

Upload the accepted MP4 to YouTube as **Unlisted**. Open it in a private window, confirm 1080p playback without authentication, then paste the URL into `docs/SUBMISSION.md` and the official Hack Hydra form.
