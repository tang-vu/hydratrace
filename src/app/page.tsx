"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, ReactFlow,
  type Edge, type Node, type NodeMouseHandler,
} from "@xyflow/react";
import {
  Activity, AlertTriangle, Braces, Check, ChevronRight, CircleDot,
  Clipboard, Clock3, Code2, Database, Download, FileCode2, GitBranch,
  Network, Play, Search, ShieldCheck, Sparkles, TestTube2, X,
} from "lucide-react";
import type { runAnalysis } from "../core/service";
import { REPOSITORY_CATALOG, repositoryMetadata, type RepositoryId } from "../core/repositories/catalog";

type BaseAnalysis = Awaited<ReturnType<typeof runAnalysis>>;
type Analysis = BaseAnalysis & { comparison?: { label: string; goldFiles: string[]; graphRecall: number; lexicalRecall: number; graphHits: string[]; lexicalHits: string[]; graphOnly: string[] } };
type UiState = "idle" | "analyzing" | "success" | "error";

const DEFAULT_TASK = "Change applyCoupon rounding behavior";

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone?: string }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail" title={detail}>{detail}</div>
    </div>
  );
}

function Risk({ value }: { value: string }) {
  return <span className={`risk risk-${value.toLowerCase()}`}>{value}</span>;
}

function download(filename: string, contents: string, type: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([contents], { type }));
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Home() {
  const [task, setTask] = useState(DEFAULT_TASK);
  const [repository, setRepository] = useState<RepositoryId>("shopflow");
  const [budget, setBudget] = useState(4_000);
  const [depth, setDepth] = useState(3);
  const [state, setState] = useState<UiState>("idle");
  const [analysis, setAnalysis] = useState<Analysis>();
  const [error, setError] = useState("");
  const [hydraReady, setHydraReady] = useState<boolean>();
  const [selectedId, setSelectedId] = useState<number>();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const autorunStarted = useRef(false);

  const checkHydra = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const result = await response.json() as { ok: boolean };
      setHydraReady(result.ok);
    } catch {
      setHydraReady(false);
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void checkHydra(), 0);
    const interval = window.setInterval(() => void checkHydra(), 15_000);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [checkHydra]);

  const analyze = useCallback(async () => {
    setState("analyzing");
    setError("");
    setCopyStatus("idle");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, task, budget, depth }),
      });
      const body = await response.json() as Analysis | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : `Analysis failed with ${response.status}`);
      setAnalysis(body);
      setSelectedId(body.impact.seeds[0]?.node.id);
      setHydraReady(true);
      setState("success");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [budget, depth, repository, task]);

  useEffect(() => {
    if (!autorunStarted.current && new URLSearchParams(window.location.search).get("autorun") === "1") {
      autorunStarted.current = true;
      void analyze();
    }
  }, [analyze]);

  const graph = useMemo(() => {
    if (!analysis) return { nodes: [] as Node[], edges: [] as Edge[] };
    const recommendations = analysis.impact.recommendations.slice(0, 18);
    const allowed = new Set(recommendations.map((item) => item.node.id));
    const selected = analysis.impact.recommendations.find((item) => item.node.id === selectedId);
    const activeNodes = new Set(selected?.evidence.nodeIds ?? []);
    const activeEdges = new Set(selected?.evidence.relationships.map((item) => item.id).filter(Boolean) ?? []);
    const byDepth = new Map<number, number>();
    const nodes: Node[] = recommendations.map((item) => {
      const level = Math.min(3, item.evidence.relationships.length);
      const offset = byDepth.get(level) ?? 0;
      byDepth.set(level, offset + 1);
      const category = analysis.impact.seeds.some((seed) => seed.node.id === item.node.id)
        ? "changed" : item.isTest ? "test" : item.node.properties.kind === "interface" ? "interface" : "production";
      return {
        id: String(item.node.id),
        position: { x: level * 260, y: offset * 92 },
        data: { label: item.symbol ?? item.path.split("/").at(-1) },
        ariaLabel: `${category} node: ${item.symbol ?? item.path}`,
        className: `flow-node node-${category} ${activeNodes.has(item.node.id) ? "path-active" : ""}`,
        style: { width: 205 },
      };
    });
    const edgesById = new Map<string, Edge>();
    for (const pathItem of analysis.impact.paths) {
      for (const relationship of pathItem.relationships) {
        if (!allowed.has(relationship.source) || !allowed.has(relationship.target)) continue;
        const id = String(relationship.id ?? `${relationship.source}-${relationship.type}-${relationship.target}`);
        edgesById.set(id, {
          id,
          source: String(relationship.source),
          target: String(relationship.target),
          label: relationship.type,
          animated: activeEdges.has(relationship.id),
          className: activeEdges.has(relationship.id) ? "edge-active" : "",
        });
      }
    }
    return { nodes, edges: [...edgesById.values()] };
  }, [analysis, selectedId]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => setSelectedId(Number(node.id)), []);
  const selected = analysis?.impact.recommendations.find((item) => item.node.id === selectedId);
  const highRisk = analysis?.impact.recommendations.filter((item) => item.risk === "High").length ?? 0;
  const tests = new Set(analysis?.impact.recommendations.filter((item) => item.isTest).map((item) => item.path)).size;
  const repositoryInfo = repositoryMetadata(repository);

  function selectRepository(id: RepositoryId) {
    setRepository(id);
    setTask(repositoryMetadata(id).defaultTask);
    setAnalysis(undefined);
    setSelectedId(undefined);
    setState("idle");
    setError("");
  }

  async function copyPack() {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis.contextPack.markdown);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1_800);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><Logo /><div><div className="wordmark">HydraTrace</div><div className="tagline">See the blast radius before your coding agent edits.</div></div></div>
        <div className="status-cluster">
          <div className={`connection ${hydraReady === true ? "online" : hydraReady === false ? "offline" : "pending"}`} role="status" aria-live="polite">
            <CircleDot size={13} /> {hydraReady === true ? "HydraDB connected" : hydraReady === false ? "HydraDB unavailable" : "Checking HydraDB"}
          </div>
          <div className="repo-chip"><GitBranch size={13} /> {repositoryInfo.name.replace(" demo", "").replace(" dogfood", "")} · {analysis?.index.indexedCommit.slice(0, 7) ?? "not indexed"}</div>
        </div>
      </header>

      <section className="hero-row">
        <div>
          <div className="eyebrow"><Sparkles size={13} /> GRAPH-NATIVE CHANGE INTELLIGENCE</div>
          <h1>Trace what breaks.<br /><span>Pack only what matters.</span></h1>
          <p>HydraTrace compiles TypeScript structure into HydraDB, follows the real dependency graph, and gives coding agents evidence-backed context before they edit.</p>
        </div>
        <div className="architecture-line">
          <span><Code2 /> TypeScript AST</span><ChevronRight /><span><Database /> HydraDB</span><ChevronRight /><span><Braces /> Context Pack</span>
        </div>
      </section>

      <form className="control-panel" onSubmit={(event) => { event.preventDefault(); void analyze(); }} aria-label="Blast radius analysis controls">
        <div className="field compact"><label htmlFor="repository">Repository</label><select id="repository" value={repository} onChange={(event) => selectRepository(event.target.value as RepositoryId)} title={repositoryInfo.description}>{REPOSITORY_CATALOG.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
        <div className="field task-field"><label htmlFor="task">Task or change intent</label><div className="input-icon"><Search size={15} aria-hidden="true" /><input id="task" value={task} onChange={(event) => setTask(event.target.value)} minLength={3} maxLength={500} required autoComplete="off" /></div></div>
        <div className="field compact"><label htmlFor="budget">Token budget</label><select id="budget" value={budget} onChange={(event) => setBudget(Number(event.target.value))}><option value={2000}>2,000</option><option value={4000}>4,000</option><option value={8000}>8,000</option></select></div>
        <div className="field depth"><label htmlFor="depth">Depth</label><select id="depth" value={depth} onChange={(event) => setDepth(Number(event.target.value))}><option value={1}>1 hop</option><option value={2}>2 hops</option><option value={3}>3 hops</option></select></div>
        <button className="primary" type="submit" disabled={state === "analyzing" || hydraReady === false || task.trim().length < 3}>
          {state === "analyzing" ? <><Activity className="spin" size={16} aria-hidden="true" /> Tracing…</> : <><Play size={16} fill="currentColor" aria-hidden="true" /> Analyze blast radius</>}
        </button>
      </form>

      {state === "idle" && <section className="empty-state"><Network size={36} /><h2>One click from source change to proven context</h2><p>{repository === "shopflow" ? "Run the coupon scenario to reveal aliased callers, a multi-hop API route, and tests that lexical retrieval misses." : "Dogfood mode compiles HydraTrace itself into HydraDB and traces the impact of changing its typed HTTP client."}</p><span className="source-badge">{repositoryInfo.kind}</span></section>}
      {state === "analyzing" && <section className="loading-state" role="status" aria-live="polite" aria-busy="true"><div className="scanline" /><Database size={30} /><h2>Traversing HydraDB</h2><p>Indexing {repositoryInfo.name}, resolving seeds, and collecting bounded native evidence paths…</p></section>}
      {state === "error" && <section className="error-state" role="alert"><AlertTriangle size={28} /><div><h2>Analysis stopped honestly</h2><p>{error}</p><code>pnpm hydra:up &amp;&amp; pnpm hydra:wait &amp;&amp; pnpm hydra:smoke</code></div></section>}

      {analysis && state === "success" && <>
        {analysis.impact.lowConfidence && <div className="warning-banner" role="status"><AlertTriangle size={15} /> Task seeding is low-confidence. Review the bounded seed candidates before editing.</div>}
        <section className="metrics-grid">
          <Metric label="Change seeds" value={analysis.impact.seeds.length} detail={analysis.impact.seeds.map((seed) => String(seed.node.properties.name ?? seed.node.properties.path)).join(", ")} tone="accent" />
          <Metric label="Impacted context" value={analysis.impact.recommendations.length} detail={`${new Set(analysis.impact.recommendations.map((item) => item.path)).size} unique files`} />
          <Metric label="High risk" value={highRisk} detail="public or downstream production" tone="danger" />
          <Metric label="Related tests" value={tests} detail="found through graph structure" tone="test" />
          <Metric label="Context budget" value={`${analysis.contextPack.estimatedTokens.toLocaleString()}`} detail={`${Math.round(analysis.contextPack.budgetUtilization * 100)}% of ${budget.toLocaleString()} estimated tokens`} />
          <Metric label={analysis.comparison ? "Graph vs lexical" : "Lexical overlap"} value={analysis.comparison ? `${Math.round(analysis.comparison.graphRecall * 100)}% / ${Math.round(analysis.comparison.lexicalRecall * 100)}%` : `${analysis.impact.recommendations.filter((item) => item.foundByBaseline).length}/${analysis.impact.recommendations.length}`} detail={analysis.comparison ? "Recall@K on matched demo case" : "ranked items also found lexically"} tone="accent" />
        </section>

        <section className="workspace-grid">
          <div className="panel graph-panel">
            <div className="panel-header"><div><div className="panel-kicker">IMPACT GRAPH</div><h2>Bounded structural evidence</h2></div><div className="legend"><span className="changed">Changed</span><span className="production">Production</span><span className="test">Test</span><span className="interface">Interface</span></div></div>
            <div className="graph-canvas">
              <ReactFlow nodes={graph.nodes} edges={graph.edges} onNodeClick={onNodeClick} fitView minZoom={0.35} maxZoom={1.5} proOptions={{ hideAttribution: true }} aria-label="Interactive impact evidence graph">
                <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#24343a" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            {selected && <div className="path-inspector"><div><span>Selected evidence</span><Risk value={selected.risk} /></div><code>{selected.evidenceText}</code><p>{selected.reason}</p></div>}
          </div>

          <div className="panel impact-panel">
            <div className="panel-header"><div><div className="panel-kicker">RANKED IMPACT</div><h2>What the agent should inspect</h2></div><span className="count-badge">{analysis.impact.recommendations.length}</span></div>
            <div className="impact-list">
              {analysis.impact.recommendations.slice(0, 14).map((item, index) => <button type="button" key={item.node.id} className={item.node.id === selectedId ? "impact-row selected" : "impact-row"} aria-pressed={item.node.id === selectedId} onClick={() => setSelectedId(item.node.id)}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="impact-main"><span className="impact-title">{item.isTest ? <TestTube2 size={14} /> : <FileCode2 size={14} />} {item.symbol ?? item.path.split("/").at(-1)}</span><span className="impact-path">{item.path}{item.startLine ? `:${item.startLine}` : ""}</span><span className="impact-reason">{item.reason}</span></span>
                <span className="impact-meta"><Risk value={item.risk} /><strong>{item.score.toFixed(2)}</strong><span className={item.foundByBaseline ? "baseline-found" : "baseline-missed"}>{item.foundByBaseline ? <><Check size={11} /> lexical</> : <><X size={11} /> lexical</>}</span></span>
              </button>)}
            </div>
          </div>
        </section>

        <section className="detail-grid">
          <div className="panel context-panel">
            <div className="panel-header"><div><div className="panel-kicker">CONTEXT PACK</div><h2>Agent-ready Markdown</h2></div><div className="actions"><button type="button" onClick={() => void copyPack()} aria-label="Copy Context Pack Markdown">{copyStatus === "copied" ? <Check size={14} /> : copyStatus === "error" ? <AlertTriangle size={14} /> : <Clipboard size={14} />}{copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy"}</button><button type="button" onClick={() => download("hydratrace-context-pack.md", analysis.contextPack.markdown, "text/markdown")} aria-label="Download Context Pack as Markdown"><Download size={14} /> MD</button><button type="button" onClick={() => download("hydratrace-analysis.json", JSON.stringify(analysis, null, 2), "application/json")} aria-label="Download complete analysis as JSON"><Download size={14} /> JSON</button></div></div>
            <div className="budget-bar"><span style={{ width: `${Math.round(analysis.contextPack.budgetUtilization * 100)}%` }} /><label>{analysis.contextPack.estimatedTokens.toLocaleString()} / {analysis.contextPack.analysis.budget.toLocaleString()} estimated tokens</label></div>
            <pre className="markdown-preview">{analysis.contextPack.markdown}</pre>
          </div>

          <div className="side-stack">
            <div className="panel comparison-panel">
              <div className="panel-header"><div><div className="panel-kicker">RETRIEVAL COMPARISON</div><h2>Same task. Different reach.</h2></div></div>
              {analysis.comparison ? <>
                <div className="compare-bars"><div><label>HydraDB graph <strong>{Math.round(analysis.comparison.graphRecall * 100)}%</strong></label><span><i style={{ width: `${analysis.comparison.graphRecall * 100}%` }} /></span></div><div className="lexical"><label>Lexical baseline <strong>{Math.round(analysis.comparison.lexicalRecall * 100)}%</strong></label><span><i style={{ width: `${analysis.comparison.lexicalRecall * 100}%` }} /></span></div></div>
                <div className="graph-only"><span>Structurally found, lexically missed</span>{analysis.comparison.graphOnly.length > 0 ? analysis.comparison.graphOnly.map((file) => <code key={file}>{file}</code>) : <em>None at this result limit</em>}</div>
              </> : <p className="muted">Edit the task freely. Recall appears only when it exactly matches a gold-labeled fixture benchmark; baseline overlap remains visible in every ranked result.</p>}
            </div>

            <div className="panel proof-panel">
              <div className="panel-header"><div><div className="panel-kicker">HYDRADB PROOF</div><h2>Execution receipt</h2></div><ShieldCheck size={20} className="proof-icon" /></div>
              <div className="proof-stats"><span><Database size={13} /> {analysis.impact.graphCounts.nodes} nodes / {analysis.impact.graphCounts.edges} edges</span><span><Clock3 size={13} /> {analysis.impact.queryReceipts.reduce((sum, item) => sum + item.latencyMs, 0).toFixed(1)} ms queries</span></div>
              {analysis.impact.queryReceipts.slice(0, 3).map((receipt) => <div className="receipt" key={receipt.queryId}><div><code>{receipt.queryId}</code><span>{receipt.resultCount} results · {receipt.latencyMs.toFixed(2)} ms</span></div><pre>{receipt.query}</pre><footer>causal · bookmark {receipt.bookmarkUsed ? "applied" : "none"} · epoch {receipt.readEpoch ?? "mutation"}</footer></div>)}
            </div>
          </div>
        </section>
      </>}

      <footer className="limitations"><span>Honest boundaries</span><p>TypeScript/JavaScript only · Static analysis may miss dynamic calls · Traversal is bounded to three hops · ShopFlow benchmark is synthetic and deterministic · No production fallback graph</p><a href="https://github.com/tang-vu/hydratrace" target="_blank" rel="noreferrer">GitHub <span className="visually-hidden">(opens in a new tab)</span><ChevronRight size={13} /></a></footer>
    </main>
  );
}
