import {
  GRAPH_NODE_KIND,
  PROVENANCE_KIND,
  type ArchitectureGraph,
  type GraphEdge,
  type GraphNode,
} from "@sentinel/schema";
import { extractCallFlows } from "./call-flow.js";
import { extractImportEdges } from "./import-graph.js";

export interface ExtractionInput {
  files: Map<string, string>;
  commitSha?: string;
}

const ROUTE_PATTERNS = [
  /@(Get|Post|Put|Patch|Delete|Controller)\(['"`]([^'"`]+)['"`]/g,
  /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
  /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
];

const AI_PATTERNS = [
  /\b(createAgent|AgentExecutor|LangChain|OpenAI|Anthropic|@ai-sdk|generateText|embeddings?)\b/g,
  /\b(RAG|vectorStore|retriev(e|al)|memory\.|tool\s*\()/gi,
];

const DATA_STORE_PATTERNS = [
  /\b(PrismaClient|mongoose|TypeORM|Redis|postgres|mongodb|supabase)\b/gi,
];

const EXTERNAL_PATTERNS = [
  /\bfetch\s*\(\s*['"`]https?:\/\/([^'"`]+)['"`]/g,
  /\baxios\.(get|post)\(\s*['"`]https?:\/\/([^'"`]+)['"`]/g,
];

function makeProvenance(
  path: string,
  confidence: number,
  rationale: string,
  commitSha?: string,
) {
  return {
    kind: PROVENANCE_KIND.OBSERVED,
    confidence,
    rationale,
    references: [{ path, commitSha }],
  };
}

const MODULE_NODE_PREFIX = "module";

export function moduleNodeIdForPath(filePath: string): string {
  return `${MODULE_NODE_PREFIX}:${filePath.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function nodeId(prefix: string, key: string): string {
  if (prefix === MODULE_NODE_PREFIX) {
    return moduleNodeIdForPath(key);
  }
  return `${prefix}:${key.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export function extractArchitectureFromTypeScript(
  input: ExtractionInput,
): ArchitectureGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodeIds = new Set<string>();

  const addNode = (node: GraphNode): void => {
    if (seenNodeIds.has(node.id)) {
      return;
    }
    seenNodeIds.add(node.id);
    nodes.push(node);
  };

  const appNodeId = nodeId("app", "main");
  addNode({
    id: appNodeId,
    kind: GRAPH_NODE_KIND.APPLICATION,
    label: "Application",
    description: "Root application inferred from repository layout",
    provenance: {
      kind: PROVENANCE_KIND.INFERRED,
      confidence: 0.6,
      rationale: "Default root application node for hierarchical views",
      references: [],
    },
  });

  addNode({
    id: nodeId("boundary", "internet"),
    kind: GRAPH_NODE_KIND.TRUST_BOUNDARY,
    label: "Internet / Untrusted Clients",
    provenance: {
      kind: PROVENANCE_KIND.INFERRED,
      confidence: 0.5,
      rationale: "External trust boundary for public clients",
      references: [],
    },
  });

  for (const [path, content] of input.files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
      continue;
    }

    const moduleNodeId = nodeId("module", path);
    addNode({
      id: moduleNodeId,
      kind: GRAPH_NODE_KIND.MODULE,
      label: path,
      parentId: appNodeId,
      provenance: makeProvenance(path, 0.9, "Source module file present in index", input.commitSha),
    });

    for (const pattern of ROUTE_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(content);
      while (match) {
        const method = match[1]?.toLowerCase() ?? "route";
        const routePath = match[2] ?? match[3] ?? "/";
        const apiId = nodeId("api", `${method}:${routePath}:${path}`);
        addNode({
          id: apiId,
          kind: GRAPH_NODE_KIND.API_ENTRY,
          label: `${method.toUpperCase()} ${routePath}`,
          parentId: moduleNodeId,
          metadata: { method, routePath, file: path },
          provenance: makeProvenance(
            path,
            0.85,
            "HTTP route decorator or Express-style route registration observed",
            input.commitSha,
          ),
        });
        edges.push({
          id: `${apiId}->${moduleNodeId}`,
          source: nodeId("boundary", "internet"),
          target: apiId,
          kind: "crosses_trust_boundary",
          bidirectional: false,
          provenance: makeProvenance(path, 0.7, "Public HTTP entry crosses external boundary", input.commitSha),
        });
        match = pattern.exec(content);
      }
    }

    for (const pattern of AI_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        const aiId = nodeId("ai", path);
        addNode({
          id: aiId,
          kind: GRAPH_NODE_KIND.AI_AGENT,
          label: `AI integration (${path})`,
          parentId: moduleNodeId,
          provenance: makeProvenance(path, 0.75, "AI/agent/RAG-related symbols observed", input.commitSha),
        });
        edges.push({
          id: `${moduleNodeId}->${aiId}`,
          source: moduleNodeId,
          target: aiId,
          kind: "invokes_tool",
          bidirectional: false,
          provenance: makeProvenance(path, 0.65, "Module references AI/agent capabilities", input.commitSha),
        });
      }
    }

    for (const pattern of DATA_STORE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        const storeId = nodeId("store", path);
        addNode({
          id: storeId,
          kind: GRAPH_NODE_KIND.DATA_STORE,
          label: `Data store usage (${path})`,
          parentId: moduleNodeId,
          provenance: makeProvenance(path, 0.8, "Database or cache client usage observed", input.commitSha),
        });
        edges.push({
          id: `${moduleNodeId}->${storeId}`,
          source: moduleNodeId,
          target: storeId,
          kind: "data_flow",
          bidirectional: false,
          provenance: makeProvenance(path, 0.75, "Module reads or writes persistent data", input.commitSha),
        });
      }
    }

    for (const pattern of EXTERNAL_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(content);
      while (match) {
        const host = match[1] ?? match[2] ?? "external";
        const externalId = nodeId("external", host);
        addNode({
          id: externalId,
          kind: GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
          label: host,
          provenance: makeProvenance(path, 0.8, "Outbound HTTP call observed", input.commitSha),
        });
        edges.push({
          id: `${moduleNodeId}->${externalId}`,
          source: moduleNodeId,
          target: externalId,
          kind: "data_flow",
          bidirectional: false,
          provenance: makeProvenance(path, 0.8, "Module sends data to external HTTP endpoint", input.commitSha),
        });
        match = pattern.exec(content);
      }
    }

    if (/\.controller\.(ts|js)$/.test(path) || path.includes("middleware")) {
      const authId = nodeId("auth", path);
      addNode({
        id: authId,
        kind: GRAPH_NODE_KIND.MODULE,
        label: `Auth/Middleware (${path})`,
        parentId: moduleNodeId,
        provenance: makeProvenance(path, 0.7, "Auth or middleware module naming convention", input.commitSha),
      });
    }
  }

  const packageJson = input.files.get("package.json");
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, string> };
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        const depId = nodeId("dep", dep);
        addNode({
          id: depId,
          kind: GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
          label: dep,
          parentId: appNodeId,
          provenance: makeProvenance("package.json", 0.95, "Dependency declared in package.json", input.commitSha),
        });
        edges.push({
          id: `${appNodeId}->${depId}`,
          source: appNodeId,
          target: depId,
          kind: "depends_on",
          bidirectional: false,
          provenance: makeProvenance("package.json", 0.95, "Runtime dependency edge", input.commitSha),
        });
      }
    } catch {
      // invalid package.json ignored
    }
  }

  const importEdges = extractImportEdges({
    files: input.files,
    commitSha: input.commitSha,
    moduleNodeId: (path) => nodeId("module", path),
  });
  edges.push(...importEdges);

  const callFlows = extractCallFlows(input.files, input.commitSha);
  for (const node of callFlows.nodes) {
    addNode(node);
  }
  edges.push(...callFlows.edges);

  return { nodes, edges };
}
