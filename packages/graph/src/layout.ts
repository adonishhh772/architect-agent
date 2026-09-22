import type { ArchitectureGraph } from "@sentinel/schema";

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    kind: string;
    parentId?: string;
    description?: string;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: { kind: string };
}

const MAX_COLUMNS_PER_ROW = 5;
const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 120;

const KIND_ROW: Record<string, number> = {
  actor: 0,
  trust_boundary: 0,
  application: 1,
  service: 2,
  module: 3,
  api_entry: 2,
  data_store: 4,
  queue: 4,
  worker: 4,
  external_system: 5,
  ai_model: 3,
  ai_agent: 3,
  ai_tool: 3,
  retrieval_store: 4,
  memory: 4,
};

export function graphToFlowLayout(graph: ArchitectureGraph): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const rowCounts = new Map<number, number>();

  const nodes: FlowNode[] = graph.nodes.map((node) => {
    const row = KIND_ROW[node.kind] ?? 3;
    const column = rowCounts.get(row) ?? 0;
    rowCounts.set(row, column + 1);
    const x = (column % MAX_COLUMNS_PER_ROW) * COLUMN_WIDTH;
    const y = row * ROW_HEIGHT + Math.floor(column / MAX_COLUMNS_PER_ROW) * ROW_HEIGHT;
    return {
      id: node.id,
      type: "sentinelNode",
      position: { x, y },
      data: {
        label: node.label,
        kind: node.kind,
        parentId: node.parentId,
        description: node.description,
      },
    };
  });

  const edges: FlowEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? edge.kind,
    data: { kind: edge.kind },
  }));

  return { nodes, edges };
}

export function getGraphNeighborhood(
  graph: ArchitectureGraph,
  nodeId: string,
  depth = 1,
): ArchitectureGraph {
  const nodeIds = new Set<string>([nodeId]);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (nodeIds.has(edge.source)) {
        next.add(edge.target);
      }
      if (nodeIds.has(edge.target)) {
        next.add(edge.source);
      }
    }
    for (const id of next) {
      nodeIds.add(id);
    }
  }
  return {
    nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  };
}
