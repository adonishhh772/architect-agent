import {
  GRAPH_NODE_KIND,
  PROVENANCE_KIND,
  type ArchitectureGraph,
  type GraphEdge,
  type GraphNode,
} from "@sentinel/schema";
import type { ExtractionInput } from "./typescript-extractor.js";
import { extractArchitectureFromTypeScript, moduleNodeIdForPath } from "./typescript-extractor.js";
import { isGoPath, isPythonPath, sourceLanguageForPath } from "./source-language.js";

const PYTHON_ROUTE =
  /@(?:app|router|bp|api)\.(?:route|get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]|@(?:app|router)\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
const GO_ROUTE =
  /(?:http\.HandleFunc|\.HandleFunc|\.(?:GET|POST|PUT|PATCH|DELETE|Handle))\(\s*"([^"]+)"/g;
const PYTHON_STORE = /\b(?:sqlalchemy|psycopg|pymongo|MongoClient|SessionLocal)\s*\(|\bdjango\.db\b|\bredis\.[A-Za-z]/;
const GO_STORE = /\b(?:sql\.Open|gorm\.Open|redis\.NewClient|pgx\.Connect|mongo\.Connect)\s*\(/;
const PYTHON_AI = /\b(openai|langchain|anthropic|ChatOpenAI|embeddings?)\b/i;
const GO_AI = /\b(openai|langchaingo|anthropic)\b/i;
const HTTP_HOST = /https?:\/\/([^/'"]+)/g;
const DEPENDENCY_LIMIT = 30;

function nodeId(prefix: string, key: string): string {
  return `${prefix}:${key.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function observed(path: string, confidence: number, rationale: string, commitSha?: string) {
  return {
    kind: PROVENANCE_KIND.OBSERVED,
    confidence,
    rationale,
    references: [{ path, commitSha }],
  };
}

export function extractArchitecture(input: ExtractionInput): ArchitectureGraph {
  const graph = extractArchitectureFromTypeScript(input);
  const seenNodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];

  const addNode = (node: GraphNode): void => {
    if (seenNodeIds.has(node.id)) {
      return;
    }
    seenNodeIds.add(node.id);
    nodes.push(node);
  };

  for (const [path, content] of input.files) {
    if (!isPythonPath(path) && !isGoPath(path)) {
      continue;
    }
    const moduleNodeId = moduleNodeIdForPath(path);
    addNode({
      id: moduleNodeId,
      kind: GRAPH_NODE_KIND.MODULE,
      label: path,
      parentId: nodeId("app", "main"),
      metadata: { language: sourceLanguageForPath(path) },
      provenance: observed(path, 0.9, "Source module file present in index", input.commitSha),
    });
    collectRoutes(path, content, moduleNodeId, input.commitSha, addNode, edges);
    collectStores(path, content, moduleNodeId, input.commitSha, addNode, edges);
    collectAi(path, content, moduleNodeId, input.commitSha, addNode, edges);
    collectHosts(path, content, moduleNodeId, input.commitSha, addNode, edges);
    collectImports(path, content, moduleNodeId, input.commitSha, input.files, addNode, edges);
  }

  collectManifestDependencies(input, addNode, edges);
  return { nodes, edges };
}

function collectRoutes(
  path: string,
  content: string,
  moduleNodeId: string,
  commitSha: string | undefined,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  const pattern = isPythonPath(path) ? PYTHON_ROUTE : GO_ROUTE;
  pattern.lastIndex = 0;
  let match = pattern.exec(content);
  while (match) {
    const routePath = match[1] ?? match[2] ?? "/";
    const apiId = nodeId("api", `${routePath}:${path}`);
    addNode({
      id: apiId,
      kind: GRAPH_NODE_KIND.API_ENTRY,
      label: routePath,
      parentId: moduleNodeId,
      metadata: { routePath, file: path, language: sourceLanguageForPath(path) },
      provenance: observed(path, 0.85, "HTTP route registration observed", commitSha),
    });
    edges.push({
      id: `boundary:${apiId}`,
      source: nodeId("boundary", "internet"),
      target: apiId,
      kind: "crosses_trust_boundary",
      bidirectional: false,
      provenance: observed(path, 0.7, "Public HTTP entry crosses external boundary", commitSha),
    });
    match = pattern.exec(content);
  }
}

function collectStores(
  path: string,
  content: string,
  moduleNodeId: string,
  commitSha: string | undefined,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  const pattern = isPythonPath(path) ? PYTHON_STORE : GO_STORE;
  if (!pattern.test(content)) {
    return;
  }
  const storeId = nodeId("store", path);
  addNode({
    id: storeId,
    kind: GRAPH_NODE_KIND.DATA_STORE,
    label: `Data store usage (${path})`,
    parentId: moduleNodeId,
    provenance: observed(path, 0.8, "Database or cache client usage observed", commitSha),
  });
  edges.push({
    id: `${moduleNodeId}->${storeId}`,
    source: moduleNodeId,
    target: storeId,
    kind: "data_flow",
    bidirectional: false,
    provenance: observed(path, 0.75, "Module reads or writes persistent data", commitSha),
  });
}

function collectAi(
  path: string,
  content: string,
  moduleNodeId: string,
  commitSha: string | undefined,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  const pattern = isPythonPath(path) ? PYTHON_AI : GO_AI;
  if (!pattern.test(content)) {
    return;
  }
  const aiId = nodeId("ai", path);
  addNode({
    id: aiId,
    kind: GRAPH_NODE_KIND.AI_AGENT,
    label: `AI integration (${path})`,
    parentId: moduleNodeId,
    provenance: observed(path, 0.75, "AI or model client usage observed", commitSha),
  });
  edges.push({
    id: `${moduleNodeId}->${aiId}`,
    source: moduleNodeId,
    target: aiId,
    kind: "invokes_tool",
    bidirectional: false,
    provenance: observed(path, 0.65, "Module references an AI client", commitSha),
  });
}

function collectHosts(
  path: string,
  content: string,
  moduleNodeId: string,
  commitSha: string | undefined,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  HTTP_HOST.lastIndex = 0;
  let match = HTTP_HOST.exec(content);
  while (match) {
    const host = match[1] ?? "external";
    const externalId = nodeId("external", host);
    addNode({
      id: externalId,
      kind: GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
      label: host,
      provenance: observed(path, 0.8, "Outbound HTTP host observed", commitSha),
    });
    edges.push({
      id: `${moduleNodeId}->${externalId}`,
      source: moduleNodeId,
      target: externalId,
      kind: "data_flow",
      bidirectional: false,
      provenance: observed(path, 0.8, "Module names an external HTTP host", commitSha),
    });
    match = HTTP_HOST.exec(content);
  }
}

const PYTHON_IMPORT = /^(?:from\s+([A-Za-z_][\w.]*)\s+import|import\s+([A-Za-z_][\w.]*))/gm;
const GO_IMPORT = /"((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+)"/g;

function collectImports(
  path: string,
  content: string,
  moduleNodeId: string,
  commitSha: string | undefined,
  files: Map<string, string>,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  const pattern = isPythonPath(path) ? PYTHON_IMPORT : GO_IMPORT;
  pattern.lastIndex = 0;
  let match = pattern.exec(content);
  while (match) {
    const importedName = match[1] ?? match[2];
    if (importedName) {
      linkImport(path, importedName, moduleNodeId, commitSha, files, addNode, edges);
    }
    match = pattern.exec(content);
  }
}

function linkImport(
  path: string,
  importedName: string,
  moduleNodeId: string,
  commitSha: string | undefined,
  files: Map<string, string>,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  const localPath = resolveLocalImport(importedName, files);
  const targetId = localPath ? moduleNodeIdForPath(localPath) : nodeId("import", importedName);
  if (!localPath) {
    addNode({
      id: targetId,
      kind: GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
      label: importedName,
      provenance: observed(path, 0.7, "Import names an external package", commitSha),
    });
  }
  const edgeId = `${moduleNodeId}->${targetId}`;
  if (edges.some((edge) => edge.id === edgeId)) {
    return;
  }
  edges.push({
    id: edgeId,
    source: moduleNodeId,
    target: targetId,
    kind: "depends_on",
    bidirectional: false,
    provenance: observed(path, 0.8, "Module import observed", commitSha),
  });
}

function resolveLocalImport(importedName: string, files: Map<string, string>): string | undefined {
  const leaf = importedName.split(".").pop() ?? importedName;
  const base = importedName.split("/").pop() ?? leaf;
  for (const filePath of files.keys()) {
    const stem = filePath.split("/").pop()?.replace(/\.(py|go)$/, "");
    if (stem && (stem === leaf || stem === base)) {
      return filePath;
    }
  }
  return undefined;
}

function collectManifestDependencies(
  input: ExtractionInput,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[],
): void {
  const appNodeId = nodeId("app", "main");
  const names = [
    ...pythonDependencies(input.files.get("requirements.txt") ?? ""),
    ...goDependencies(input.files.get("go.mod") ?? ""),
  ].slice(0, DEPENDENCY_LIMIT);
  for (const name of names) {
    const depId = nodeId("dep", name);
    const manifest = input.files.has("requirements.txt") && pythonDependencies(input.files.get("requirements.txt") ?? "").includes(name)
      ? "requirements.txt"
      : "go.mod";
    addNode({
      id: depId,
      kind: GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
      label: name,
      parentId: appNodeId,
      provenance: observed(manifest, 0.9, "Dependency declared in a language manifest", input.commitSha),
    });
    edges.push({
      id: `${appNodeId}->${depId}`,
      source: appNodeId,
      target: depId,
      kind: "depends_on",
      bidirectional: false,
      provenance: observed(manifest, 0.9, "Runtime dependency edge", input.commitSha),
    });
  }
}

function pythonDependencies(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const name = trimmed.split(/[=<>\[]/)[0]?.trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function goDependencies(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split("\n")) {
    const match = /^\s*(?:require\s+)?([A-Za-z0-9._/-]+\.[A-Za-z0-9._/-]+)\s+v[0-9]/.exec(line.trim());
    const name = match?.[1];
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}
