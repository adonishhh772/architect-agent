import {
  GRAPH_NODE_KIND,
  PROVENANCE_KIND,
  type GraphEdge,
  type GraphNode,
} from "@sentinel/schema";

const IMPORT_FROM_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const REQUIRE_PATTERN = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveImportSpecifier(fromPath: string, specifier: string): string | null {
  const normalizedFrom = normalizeSlashes(fromPath);
  if (specifier.startsWith(".")) {
    const fromDir = normalizedFrom.includes("/")
      ? normalizedFrom.slice(0, normalizedFrom.lastIndexOf("/"))
      : "";
    const combined = normalizeSlashes(`${fromDir}/${specifier}`);
    const segments = combined.split("/");
    const resolved: string[] = [];
    for (const segment of segments) {
      if (segment === "" || segment === ".") {
        continue;
      }
      if (segment === "..") {
        resolved.pop();
        continue;
      }
      resolved.push(segment);
    }
    return resolved.join("/");
  }
  return null;
}

function candidatePaths(resolvedBase: string): string[] {
  const extensions = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
  return extensions.map((extension) =>
    extension.startsWith("/") ? `${resolvedBase}${extension}` : `${resolvedBase}${extension}`,
  );
}

function findIndexedTarget(resolvedBase: string, indexedPaths: Set<string>): string | null {
  for (const candidate of candidatePaths(resolvedBase)) {
    if (indexedPaths.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export interface ImportGraphInput {
  files: Map<string, string>;
  commitSha?: string;
  moduleNodeId: (path: string) => string;
}

export function extractImportEdges(input: ImportGraphInput): GraphEdge[] {
  const indexedPaths = new Set(input.files.keys());
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const [fromPath, content] of input.files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(fromPath)) {
      continue;
    }
    const specifiers = new Set<string>();
    for (const pattern of [IMPORT_FROM_PATTERN, REQUIRE_PATTERN]) {
      pattern.lastIndex = 0;
      let match = pattern.exec(content);
      while (match) {
        const spec = match[1] ?? match[2];
        if (spec) {
          specifiers.add(spec);
        }
        match = pattern.exec(content);
      }
    }

    const sourceId = input.moduleNodeId(fromPath);
    for (const specifier of specifiers) {
      const resolved = resolveImportSpecifier(fromPath, specifier);
      if (!resolved) {
        continue;
      }
      const targetPath = findIndexedTarget(resolved, indexedPaths);
      if (!targetPath || targetPath === fromPath) {
        continue;
      }
      const targetId = input.moduleNodeId(targetPath);
      const edgeId = `${sourceId}->${targetId}:import`;
      if (seen.has(edgeId)) {
        continue;
      }
      seen.add(edgeId);
      edges.push({
        id: edgeId,
        source: sourceId,
        target: targetId,
        kind: "depends_on",
        bidirectional: false,
        provenance: {
          kind: PROVENANCE_KIND.OBSERVED,
          confidence: 0.85,
          rationale: "Relative import between indexed modules",
          references: [{ path: fromPath, commitSha: input.commitSha }],
        },
      });
    }
  }

  return edges;
}

export function folderKeyForPath(path: string, depth = 3): string {
  const parts = normalizeSlashes(path).split("/").filter(Boolean);
  if (parts.length <= depth) {
    return parts.join("/") || path;
  }
  return parts.slice(0, depth).join("/");
}

export interface FolderOverviewOptions {
  depth?: number;
}

export function buildFolderOverviewGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: FolderOverviewOptions = {},
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const depth = options.depth ?? 3;
  const moduleNodes = nodes.filter((node) => node.kind === GRAPH_NODE_KIND.MODULE);
  const folderToModuleIds = new Map<string, string[]>();
  const moduleIdToPath = new Map<string, string>();

  for (const node of moduleNodes) {
    const path = node.label;
    moduleIdToPath.set(node.id, path);
    const folder = folderKeyForPath(path, depth);
    const list = folderToModuleIds.get(folder) ?? [];
    list.push(node.id);
    folderToModuleIds.set(folder, list);
  }

  const folderNodes: GraphNode[] = [];
  const folderIdByKey = new Map<string, string>();

  for (const [folder, moduleIds] of folderToModuleIds) {
    const id = `folder:${folder.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    folderIdByKey.set(folder, id);
    folderNodes.push({
      id,
      kind: GRAPH_NODE_KIND.SERVICE,
      label: folder,
      description: `${moduleIds.length} modules`,
      metadata: { moduleCount: moduleIds.length, folderPath: folder },
      provenance: {
        kind: PROVENANCE_KIND.INFERRED,
        confidence: 0.9,
        rationale: "Folder aggregate for architecture overview",
        references: [],
      },
    });
  }

  const nonModuleNodes = nodes.filter((node) => node.kind !== GRAPH_NODE_KIND.MODULE);
  const folderEdgeCounts = new Map<string, number>();

  for (const edge of edges) {
    const sourcePath = moduleIdToPath.get(edge.source);
    const targetPath = moduleIdToPath.get(edge.target);
    if (!sourcePath || !targetPath) {
      continue;
    }
    const sourceFolder = folderKeyForPath(sourcePath, depth);
    const targetFolder = folderKeyForPath(targetPath, depth);
    if (sourceFolder === targetFolder) {
      continue;
    }
    const sourceFolderId = folderIdByKey.get(sourceFolder);
    const targetFolderId = folderIdByKey.get(targetFolder);
    if (!sourceFolderId || !targetFolderId) {
      continue;
    }
    const key = `${sourceFolderId}->${targetFolderId}`;
    folderEdgeCounts.set(key, (folderEdgeCounts.get(key) ?? 0) + 1);
  }

  const folderEdges: GraphEdge[] = [];
  for (const [key, weight] of folderEdgeCounts) {
    const [source, target] = key.split("->");
    if (!source || !target) {
      continue;
    }
    folderEdges.push({
      id: `folder-edge:${key}`,
      source,
      target,
      kind: "depends_on",
      label: `${weight} imports`,
      bidirectional: false,
      provenance: {
        kind: PROVENANCE_KIND.INFERRED,
        confidence: 0.8,
        rationale: "Aggregated cross-folder import relations",
        references: [],
      },
    });
  }

  return {
    nodes: [...nonModuleNodes, ...folderNodes],
    edges: [
      ...edges.filter((edge) => !moduleIdToPath.has(edge.source) || !moduleIdToPath.has(edge.target)),
      ...folderEdges,
    ],
  };
}

export function sliceModuleGraphPage(
  nodes: GraphNode[],
  edges: GraphEdge[],
  folderPrefix: string,
  pageIndex: number,
  pageSize: number,
): { nodes: GraphNode[]; edges: GraphEdge[]; totalModules: number; pageCount: number } {
  const prefix = normalizeSlashes(folderPrefix);
  const moduleNodes = nodes
    .filter(
      (node) =>
        node.kind === GRAPH_NODE_KIND.MODULE &&
        (prefix.length === 0 || node.label.startsWith(prefix)),
    )
    .sort((left, right) => left.label.localeCompare(right.label));

  const totalModules = moduleNodes.length;
  const pageCount = Math.max(1, Math.ceil(totalModules / pageSize));
  const safePage = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const pageModules = moduleNodes.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageIds = new Set(pageModules.map((node) => node.id));

  const supportNodes = nodes.filter(
    (node) =>
      node.kind !== GRAPH_NODE_KIND.MODULE &&
      (pageIds.has(node.id) ||
        pageModules.some((moduleNode) => moduleNode.parentId === node.id)),
  );

  const pageNodeIds = new Set([...pageModules, ...supportNodes].map((node) => node.id));
  const pageEdges = edges.filter(
    (edge) => pageNodeIds.has(edge.source) && pageNodeIds.has(edge.target),
  );

  return {
    nodes: [...supportNodes, ...pageModules],
    edges: pageEdges,
    totalModules,
    pageCount,
  };
}
