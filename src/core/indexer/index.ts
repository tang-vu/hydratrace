import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ModuleKind,
  Node,
  Project,
  ScriptTarget,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import { IdRegistry } from "../graph/ids";
import type { EdgeType, GraphEdge, GraphNode, IndexedRepository, Scalar } from "../graph/model";
import { discoverSourceFiles, fileKind, isTestPath, normalizeRelativePath } from "./discovery";

interface SymbolRecord {
  node: GraphNode;
  declaration: Node;
  sourceFile: SourceFile;
  start: number;
  end: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, maximum = 280): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function gitCommit(root: string): string {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "uncommitted";
  }
}

function declarationKind(node: Node): string {
  if (Node.isFunctionDeclaration(node)) return "function";
  if (Node.isClassDeclaration(node)) return "class";
  if (Node.isMethodDeclaration(node)) return "method";
  if (Node.isConstructorDeclaration(node)) return "constructor";
  if (Node.isInterfaceDeclaration(node)) return "interface";
  if (Node.isTypeAliasDeclaration(node)) return "type";
  if (Node.isEnumDeclaration(node)) return "enum";
  if (Node.isVariableDeclaration(node)) return "function-variable";
  return node.getKindName().toLowerCase();
}

function declarationName(node: Node): string {
  if (Node.isConstructorDeclaration(node)) return "constructor";
  if ("getName" in node && typeof node.getName === "function") return node.getName() ?? "anonymous";
  return "anonymous";
}

function qualifiedName(node: Node): string {
  const parts = [declarationName(node)];
  let parent = node.getParent();
  while (parent) {
    if (Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) {
      const name = parent.getName();
      if (name) parts.unshift(name);
    }
    parent = parent.getParent();
  }
  return parts.join(".");
}

function isExported(node: Node): boolean {
  if (Node.isMethodDeclaration(node) || Node.isConstructorDeclaration(node)) {
    const owner = node.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    return Boolean(owner?.isExported() || owner?.isDefaultExport());
  }
  return "isExported" in node && typeof node.isExported === "function" && (node.isExported() || ("isDefaultExport" in node && typeof node.isDefaultExport === "function" && node.isDefaultExport()));
}

function declarationsForFile(sourceFile: SourceFile): Node[] {
  const output: Node[] = [];
  output.push(...sourceFile.getFunctions().filter((declaration) => !declaration.isOverload()));
  output.push(...sourceFile.getClasses());
  output.push(...sourceFile.getInterfaces());
  output.push(...sourceFile.getTypeAliases());
  output.push(...sourceFile.getEnums());
  for (const klass of sourceFile.getClasses()) {
    output.push(...klass.getMethods().filter((declaration) => !declaration.isOverload()), ...klass.getConstructors());
  }
  for (const statement of sourceFile.getVariableStatements()) {
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) output.push(declaration);
    }
  }
  return output.sort((a, b) => a.getStart() - b.getStart());
}

function containingSymbol(records: SymbolRecord[], node: Node): SymbolRecord | undefined {
  const position = node.getStart();
  return records
    .filter((record) => record.start <= position && record.end >= position)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
}

function targetForDeclaration(allRecords: SymbolRecord[], declaration: Node): SymbolRecord | undefined {
  const source = declaration.getSourceFile();
  return containingSymbol(allRecords.filter((record) => record.sourceFile === source), declaration);
}

function resolveAliasedDeclarations(node: Node): Node[] {
  const symbol = "getSymbol" in node && typeof node.getSymbol === "function" ? node.getSymbol() : undefined;
  if (!symbol) return [];
  const resolved = symbol.isAlias() ? symbol.getAliasedSymbol() : symbol;
  return resolved?.getDeclarations() ?? [];
}

function addEdge(
  edges: GraphEdge[], registry: IdRegistry, seen: Set<string>, type: EdgeType,
  source: number, target: number, properties: Record<string, Scalar> = {},
): void {
  if (source === target && type !== "CALLS") return;
  const canonical = `edge:${type}:${source}:${target}`;
  if (seen.has(canonical)) return;
  seen.add(canonical);
  edges.push({ id: registry.claim(canonical), type, source, target, properties: { confidence: "semantic", ...properties } });
}

export async function indexRepository(requestedRoot: string): Promise<IndexedRepository> {
  const started = performance.now();
  const discovery = await discoverSourceFiles(requestedRoot);
  const registry = new IdRegistry();
  const rootHash = sha256(discovery.root).slice(0, 16);
  const repositoryKey = `repository:${normalizeRelativePath(discovery.root).toLowerCase()}`;
  const repository: GraphNode = {
    id: registry.claim(repositoryKey), label: "Repository", canonicalKey: repositoryKey,
    properties: {
      name: path.basename(discovery.root), rootHash, indexedCommit: gitCommit(discovery.root),
      indexedTimestamp: new Date().toISOString(),
    },
  };
  const tsconfig = path.join(discovery.root, "tsconfig.json");
  let hasTsconfig = false;
  try { await readFile(tsconfig); hasTsconfig = true; } catch { /* fallback config */ }
  const project = hasTsconfig
    ? new Project({ tsConfigFilePath: tsconfig, skipAddingFilesFromTsConfig: true })
    : new Project({ compilerOptions: { allowJs: true, checkJs: false, target: ScriptTarget.ES2022, module: ModuleKind.ESNext } });
  for (const file of discovery.files) project.addSourceFileAtPath(file);
  project.resolveSourceFileDependencies();
  const projectFiles = project.getSourceFiles().filter((file) => {
    const relative = path.relative(discovery.root, file.getFilePath());
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  });

  const nodes: GraphNode[] = [repository];
  const edges: GraphEdge[] = [];
  const edgeSeen = new Set<string>();
  const fileNodes = new Map<string, GraphNode>();
  const records: SymbolRecord[] = [];
  const warnings: string[] = hasTsconfig ? [] : ["No tsconfig.json found; HydraTrace used a safe TypeScript fallback configuration."];

  for (const sourceFile of projectFiles) {
    const relative = normalizeRelativePath(path.relative(discovery.root, sourceFile.getFilePath()));
    const content = sourceFile.getFullText();
    const key = `file:${rootHash}:${relative}`;
    const kind = fileKind(relative);
    const fileNode: GraphNode = {
      id: registry.claim(key), label: "File", canonicalKey: key,
      properties: {
        path: relative, extension: path.extname(relative), kind, fileKind: kind,
        lineCount: sourceFile.getEndLineNumber(), contentHash: sha256(content), isTest: isTestPath(relative), deleted: false, rootHash,
      },
    };
    nodes.push(fileNode);
    fileNodes.set(sourceFile.getFilePath(), fileNode);
    addEdge(edges, registry, edgeSeen, "CONTAINS", repository.id, fileNode.id);

    for (const declaration of declarationsForFile(sourceFile)) {
      const name = declarationName(declaration);
      const qualified = qualifiedName(declaration);
      const kindName = declarationKind(declaration);
      const keySymbol = `symbol:${rootHash}:${relative}:${qualified}:${kindName}`;
      const symbolNode: GraphNode = {
        id: registry.claim(keySymbol), label: "Symbol", canonicalKey: keySymbol,
        properties: {
          name, qualifiedName: qualified, kind: kindName, path: relative,
          startLine: declaration.getStartLineNumber(), endLine: declaration.getEndLineNumber(),
          exported: isExported(declaration),
          async: "getModifiers" in declaration && typeof declaration.getModifiers === "function"
            ? declaration.getModifiers().some((modifier: Node) => modifier.getKind() === SyntaxKind.AsyncKeyword)
            : false,
          signature: bounded(declaration.getText().split("{")[0] ?? declaration.getText()),
          fileKind: kind, rootHash,
        },
      };
      nodes.push(symbolNode);
      records.push({ node: symbolNode, declaration, sourceFile, start: declaration.getStart(), end: declaration.getEnd() });
      addEdge(edges, registry, edgeSeen, "DEFINES", fileNode.id, symbolNode.id);
    }
  }

  let importsResolved = 0;
  let importsUnresolved = 0;
  let callsResolved = 0;
  let callsUnresolved = 0;
  for (const sourceFile of projectFiles.filter((file) => fileNodes.has(file.getFilePath()))) {
    const sourceFileNode = fileNodes.get(sourceFile.getFilePath())!;
    const sourceRecords = records.filter((record) => record.sourceFile === sourceFile);
    const testFile = isTestPath(String(sourceFileNode.properties.path));
    for (const declaration of sourceFile.getImportDeclarations()) {
      const targetFile = declaration.getModuleSpecifierSourceFile();
      const targetFileNode = targetFile ? fileNodes.get(targetFile.getFilePath()) : undefined;
      if (!targetFileNode) {
        importsUnresolved += 1;
        continue;
      }
      importsResolved += 1;
      addEdge(edges, registry, edgeSeen, "IMPORTS", sourceFileNode.id, targetFileNode.id);
      if (testFile) {
        const importedNames = new Set([
          ...declaration.getNamedImports().map((item) => item.getNameNode().getText()),
          declaration.getDefaultImport()?.getText(),
        ].filter((value): value is string => Boolean(value)));
        const targets = records.filter((record) => record.sourceFile === targetFile && (importedNames.size === 0 || importedNames.has(String(record.node.properties.name))));
        for (const target of targets) addEdge(edges, registry, edgeSeen, "TESTS", sourceFileNode.id, target.node.id, { confidence: "import" });
      }
    }

    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const caller = containingSymbol(sourceRecords, call);
      if (!caller) continue;
      const declarations = resolveAliasedDeclarations(call.getExpression());
      const candidates = declarations
        .map((declaration) => targetForDeclaration(records, declaration))
        .filter((record): record is SymbolRecord => Boolean(record));
      const unique = [...new Map(candidates.map((record) => [record.node.id, record])).values()];
      if (unique.length === 1) {
        callsResolved += 1;
        addEdge(edges, registry, edgeSeen, "CALLS", caller.node.id, unique[0]!.node.id);
        if (testFile) addEdge(edges, registry, edgeSeen, "TESTS", sourceFileNode.id, unique[0]!.node.id, { confidence: "call" });
      } else {
        callsUnresolved += 1;
      }
    }

    for (const owner of sourceFile.getInterfaces()) {
      const ownerRecord = records.find((record) => record.declaration === owner);
      if (!ownerRecord) continue;
      for (const heritage of owner.getExtends()) {
        for (const declaration of resolveAliasedDeclarations(heritage.getExpression())) {
          const target = targetForDeclaration(records, declaration);
          if (target) addEdge(edges, registry, edgeSeen, "EXTENDS", ownerRecord.node.id, target.node.id);
        }
      }
    }
    for (const owner of sourceFile.getClasses()) {
      const ownerRecord = records.find((record) => record.declaration === owner);
      if (!ownerRecord) continue;
      const extended = owner.getExtends();
      if (extended) {
        for (const declaration of resolveAliasedDeclarations(extended.getExpression())) {
          const target = targetForDeclaration(records, declaration);
          if (target) addEdge(edges, registry, edgeSeen, "EXTENDS", ownerRecord.node.id, target.node.id);
        }
      }
      for (const heritage of owner.getImplements()) {
        for (const declaration of resolveAliasedDeclarations(heritage.getExpression())) {
          const target = targetForDeclaration(records, declaration);
          if (target) addEdge(edges, registry, edgeSeen, "IMPLEMENTS", ownerRecord.node.id, target.node.id);
        }
      }
    }
  }

  for (const edge of edges) edge.properties.rootHash = rootHash;
  nodes.sort((a, b) => a.id - b.id);
  edges.sort((a, b) => a.id - b.id);
  const elapsedMs = Number((performance.now() - started).toFixed(2));
  return {
    schemaVersion: 1, root: discovery.root, rootHash, repository, nodes, edges,
    diagnostics: {
      filesScanned: fileNodes.size, filesExcluded: discovery.excluded,
      symbolsExtracted: records.length, importsResolved, importsUnresolved,
      callsResolved, callsUnresolved, testsDetected: [...fileNodes.values()].filter((node) => node.properties.isTest).length,
      nodesWritten: 0, edgesWritten: 0, elapsedMs, warnings,
    },
    indexedAt: new Date().toISOString(), indexedCommit: String(repository.properties.indexedCommit),
  };
}
