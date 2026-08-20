export interface VideoScene {
  id: string;
  still: string;
  narration: string;
  speech?: string;
}

export const voiceDescription = [
  "Speak like a calm, precise principal engineer presenting an international developer product: quietly confident, technically credible, and never theatrical.",
  "Use a neutral English accent, a brisk but unhurried pace, crisp technical pronunciation, and subtle emphasis on evidence and graph recall. Read only the supplied narration verbatim; do not add an introduction, conclusion, numbering, or commentary.",
].join("\n");

export const videoScenes: VideoScene[] = [
  {
    id: "title",
    still: "00-title.png",
    narration: "Before your coding agent edits, HydraTrace shows exactly what can break, and why.",
    speech: "Before your coding agent edits, Hydra Trace shows exactly what can break, and why.",
  },
  {
    id: "problem",
    still: "01-hero.png",
    narration: "Coding agents are excellent at locating text that looks relevant. The dangerous misses are structural: an aliased caller, an indirect test, an interface contract, or an API route three hops downstream.",
    speech: "Coding agents are excellent at locating text that looks relevant. The dangerous misses are structural: a caller reached through an import alias, an indirect test, an interface contract, or an API route three hops downstream.",
  },
  {
    id: "product",
    still: "03-overview.png",
    narration: "HydraTrace compiles TypeScript and JavaScript semantics into HydraDB. A task or Git diff selects deterministic change seeds, then bounded native graph traversal retrieves the blast radius. There is no fallback graph, and no language model in the critical path.",
    speech: "Hydra Trace compiles TypeScript and JavaScript semantics into the Hydra database. A task or Git diff selects deterministic change seeds, then bounded native graph traversal retrieves the blast radius. There is intentionally no alternative graph database, and no language model in the critical path.",
  },
  {
    id: "indexing",
    still: "03-overview.png",
    narration: "Here, the synthetic ShopFlow repository becomes twenty-nine stable nodes and fifty-seven typed edges. The task changes applyCoupon rounding. Exact symbol matching selects applyCoupon as the seed with auditable confidence.",
    speech: "Here, the synthetic Shop Flow repository becomes twenty-nine stable nodes and fifty-seven typed edges. The task changes apply coupon rounding. Exact symbol matching selects apply coupon as the seed with auditable confidence.",
  },
  {
    id: "callers",
    still: "04-caller.png",
    narration: "HydraDB returns whole evidence paths. CalculateOrderTotal calls the changed function through a re-exported alias. FinalizePurchase depends on that result. Every arrow is typed, bounded, and returned from the stored graph.",
    speech: "The Hydra database returns whole evidence paths. Calculate order total calls the changed function through a re-exported alias. Finalize purchase depends on that result. Every arrow is typed, bounded, and returned from the stored graph.",
  },
  {
    id: "route",
    still: "05-route.png",
    narration: "CheckoutRoute sits three hops away. Selecting the recommendation highlights the exact chain from applyCoupon, through calculateOrderTotal and finalizePurchase, to the API boundary. That path is the proof for why this file belongs in the blast radius.",
    speech: "The checkout A P I route sits three hops away. Selecting the recommendation highlights the exact chain from apply coupon, through calculate order total and finalize purchase, to the API boundary. That path is the proof for why this file belongs in the blast radius.",
  },
  {
    id: "tests",
    still: "06-test.png",
    narration: "The task never names a test file. HydraTrace still finds totalsCannotBecomeNegative through the call graph. Ranking stays explainable: shorter paths, public surfaces, downstream production callers, tests, and independent evidence each contribute a visible score.",
    speech: "The task never names a test file. Hydra Trace still finds totals cannot become negative through the call graph. Ranking stays explainable: shorter paths, public surfaces, downstream production callers, tests, and independent evidence each contribute a visible score.",
  },
  {
    id: "context",
    still: "07-details.png",
    narration: "On this executed case, graph recall is eighty-three percent, versus seventeen percent for the same lexical signals. Across seven deterministic cases, graph recall is ninety-five point two percent. HydraTrace then spends the four-thousand-token budget on ranked snippets, each carrying its risk, reason, and evidence path.",
    speech: "On this executed case, graph recall is eighty-three percent, versus seventeen percent for the same lexical signals. Across seven deterministic cases, graph recall is ninety-five point two percent. Hydra Trace then spends the four-thousand-token budget on ranked snippets, each carrying its risk, reason, and evidence path.",
  },
  {
    id: "proof",
    still: "08-proof.png",
    narration: "This is not a staged graph. The proof panel shows the live algo dot S S paths query, query identifier, latency, result count, causal bookmark, read epoch, and the twenty-nine-node, fifty-seven-edge graph stored in HydraDB.",
    speech: "This is not a staged graph. The proof panel shows the live Hydra database single-source path procedure, its query identifier, latency, result count, causal bookmark, read epoch, and the twenty-nine-node, fifty-seven-edge graph stored in the Hydra database.",
  },
  {
    id: "mcp",
    still: "09-mcp.png",
    narration: "The same verified result is available through a real Model Context Protocol handshake. Get change context returns evidence-backed recommendations and a bounded Context Pack directly to coding agents.",
  },
  {
    id: "close",
    still: "10-close.png",
    narration: "HydraTrace. Less context, but the right context, with proof before the edit.",
    speech: "Hydra Trace. Less context, but the right context, with proof before the edit.",
  },
];

export function spokenNarration(scene: VideoScene): string {
  return scene.speech ?? scene.narration;
}

export const narrationText = videoScenes.map(spokenNarration).join("\n\n(pauses briefly)\n\n");

export function narrationWordCount(text = narrationText): number {
  return text.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean).length;
}
