# MCP integration

HydraTrace exposes its live analysis through a local stdio Model Context Protocol server. The server and the CLI call the same `runAnalysis` service: both index the requested TypeScript/JavaScript repository into HydraDB, execute bounded native paths, and return evidence-backed context. There is no MCP-only fallback or sample-data response.

## Tools

### `get_change_context`

Inputs: repository path, task, optional Git base/head, token budget (400–32,000), and maximum depth (1–3). The text result is the Markdown Context Pack. Structured content adds seeds, ranked recommendations, evidence paths, score decomposition, index diagnostics, graph counts, lexical results, bounded diff metadata, and sanitized HydraDB query receipts. The full raw source index and raw diff text are deliberately excluded from the protocol payload.

### `explain_symbol_impact`

Inputs: repository path, symbol/qualified name/path, token budget, and maximum depth. It deterministically resolves the symbol and returns the same bounded evidence contract.

Both tools are marked non-destructive and idempotent, but not read-only: indexing mutates the configured HydraDB graph. They do not edit the analyzed repository and MCP calls do not write `generated/latest` artifacts.

## Prerequisites and protocol verification

```bash
pnpm install
pnpm hydra:prepare
pnpm hydra:up
pnpm hydra:wait
pnpm mcp:verify
```

`mcp:verify` starts the stdio server through a real `@modelcontextprotocol/sdk` client, completes the protocol handshake, lists both tools, calls both tools against ShopFlow, validates structured output, checks non-seed evidence relationships, checks HydraDB receipts, and enforces the Context Pack budget.

## Codex configuration

The Codex CLI and IDE use the same MCP configuration. From any shell, replace the path below with the absolute checkout path:

```bash
codex mcp add hydratrace -- pnpm --dir /absolute/path/to/hydratrace mcp
codex mcp list
```

Equivalent `config.toml`:

```toml
[mcp_servers.hydratrace]
command = "pnpm"
args = ["--dir", "/absolute/path/to/hydratrace", "mcp"]
cwd = "/absolute/path/to/hydratrace"
startup_timeout_sec = 20
tool_timeout_sec = 120
```

On Windows, use an absolute path such as `C:\\Users\\you\\Documents\\GitHub\\hydratrace`. If the token file is outside the checkout, set `HYDRADB_TOKEN_FILE` in the MCP server environment rather than placing a token in arguments.

## Generic client configuration

Clients that accept the common stdio JSON form can use:

```json
{
  "mcpServers": {
    "hydratrace": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/hydratrace", "mcp"],
      "cwd": "/absolute/path/to/hydratrace"
    }
  }
}
```

The exact configuration key is client-specific. The stdio protocol itself is covered by `pnpm mcp:verify`; HydraTrace does not claim testing against every MCP host.

## Trust boundary

The MCP server is a local developer tool and runs with the invoking user’s filesystem permissions. Only pass repository paths you intend it to read. Discovery excludes symlinks, dependencies, build output, caches, binaries, and generated HydraTrace data; canonical-path checks prevent snippet hydration from escaping the selected root. Task text never becomes Cypher syntax, and bearer tokens are never returned through MCP.
