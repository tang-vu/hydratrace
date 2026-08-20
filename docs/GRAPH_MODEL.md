# Graph model and HydraDB query contract

## Nodes

| Label | Key properties | Canonical key |
|---|---|---|
| `Repository` | name, root hash, indexed commit/time | `repository:<normalized-root>` |
| `File` | POSIX path, extension, kind, line count, content hash | `file:<root-hash>:<relative-path>` |
| `Symbol` | name, qualified name, kind, path/range, exported/async, bounded signature | `symbol:<root-hash>:<path>:<qualified-name>:<kind>` |
| `ChangeSet` | base/head, summary, time | `changeset:<root-hash>:<base>:<head>` |

IDs are the first 52 bits of SHA-256 over canonical keys. They are non-negative, safe to round-trip through JavaScript and HydraDB JSON, stable for unchanged code, and claimed through a registry that throws on collision. File, Symbol, and ChangeSet keys include the repository root hash so identical relative paths from different indexed repositories cannot merge in one graph.

## Relationships

`CONTAINS` (Repository→File), `DEFINES` (File→Symbol), `IMPORTS` (File→File), `CALLS` (Symbol→Symbol), `EXTENDS` and `IMPLEMENTS` (Symbol→Symbol), `TESTS` (test File→Symbol), and `TOUCHES` (ChangeSet→File/Symbol).

`CALLS` is created only when the TypeScript checker resolves one unique internal declaration. `TESTS` is created when a test file imports or semantically calls an internal symbol. Unresolved calls are counted and never converted into invented edges.

## Compatible ingestion

Rows are grouped by label or relationship type/end labels, capped at 250, and always supply a uniform property schema.

```cypher
UNWIND $rows AS row
MERGE (n {id: row.id})
SET n:Symbol,
    n.name = row.name,
    n.path = row.path,
    n.startLine = row.startLine
```

```cypher
UNWIND $rows AS row
MATCH (s:Symbol {id: row.source}), (d:Symbol {id: row.target})
MERGE (s)-[r:CALLS {id: row.id}]->(d)
SET r.confidence = row.confidence
```

The production builder never sends a label, type, or property identifier derived from user text.

## Traversal

HydraTrace executes one bounded native traversal per seed because numeric IDs are the stable selector and current `MSpaths` selectors are literal/index-oriented.

```cypher
CALL algo.SSpaths({
  sourceNode: $source,
  relTypes: ['CALLS', 'IMPORTS', 'TESTS', 'EXTENDS', 'IMPLEMENTS', 'DEFINES'],
  relDirection: 'both',
  maxLen: 3,
  pathCount: 100,
  resultLimit: 100
})
YIELD path, pathCost
RETURN path, pathCost
```

Native path nodes and relationship properties use nested externally tagged values; scalar row values use HydraDB’s `{type,value}` tags. `src/hydradb/values.ts` handles both contracts. Canonical `src`/`dst` is preserved when the path walks an edge in reverse, allowing the UI to render `CALLS` orientation honestly.

HydraDB’s current subset allows one statement, explicit projections, bounded variable paths, and narrow `UNWIND`. It rejects `RETURN *`, unbounded traversal, multiple relationship types in a regular pattern, unsupported predicates (`IN`, `CONTAINS`, `ENDS WITH`, `IS NULL`), aliased/filtering `WITH`, and `ON CREATE`/`ON MATCH`.
