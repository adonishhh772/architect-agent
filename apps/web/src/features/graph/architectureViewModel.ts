import {
  buildFolderOverviewGraph,
  folderKeyForPath,
  sliceModuleGraphPage,
} from "@sentinel/graph";
import type { AnalysisReport, ArchitectureGraph } from "@sentinel/schema";
import { GRAPH_NODE_KIND } from "@sentinel/schema";

export const ARCHITECTURE_VIEW_MODE = {
  FOLDER_OVERVIEW: "folder_overview",
  FOLDER_DETAIL: "folder_detail",
} as const;

export type ArchitectureViewMode =
  (typeof ARCHITECTURE_VIEW_MODE)[keyof typeof ARCHITECTURE_VIEW_MODE];

export const MODULES_PER_PAGE = 24;

export function listArchitectureFolders(graph: ArchitectureGraph, depth = 3): string[] {
  const folders = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== GRAPH_NODE_KIND.MODULE) {
      continue;
    }
    folders.add(folderKeyForPath(node.label, depth));
  }
  return [...folders].sort((left, right) => left.localeCompare(right));
}

export function countFindingsByFolderPrefix(
  findings: AnalysisReport["findings"],
  depth = 3,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    for (const reference of finding.references) {
      const folder = folderKeyForPath(reference.path, depth);
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
    if (finding.references.length === 0 && finding.affectedAssetSummary.includes("/")) {
      const folder = folderKeyForPath(finding.affectedAssetSummary, depth);
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
  }
  return counts;
}

export function buildArchitectureDisplayGraph(input: {
  graph: ArchitectureGraph;
  viewMode: ArchitectureViewMode;
  folderPrefix: string;
  pageIndex: number;
}): {
  displayGraph: ArchitectureGraph;
  totalModules: number;
  pageCount: number;
  pageIndex: number;
} {
  if (input.viewMode === ARCHITECTURE_VIEW_MODE.FOLDER_OVERVIEW) {
    const overview = buildFolderOverviewGraph(input.graph.nodes, input.graph.edges, { depth: 3 });
    return {
      displayGraph: { nodes: overview.nodes, edges: overview.edges },
      totalModules: input.graph.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.MODULE).length,
      pageCount: 1,
      pageIndex: 0,
    };
  }

  const sliced = sliceModuleGraphPage(
    input.graph.nodes,
    input.graph.edges,
    input.folderPrefix,
    input.pageIndex,
    MODULES_PER_PAGE,
  );

  return {
    displayGraph: { nodes: sliced.nodes, edges: sliced.edges },
    totalModules: sliced.totalModules,
    pageCount: sliced.pageCount,
    pageIndex: input.pageIndex,
  };
}
