import type { ArchitectureGraph, GraphNode } from "@sentinel/schema";
import {
  FOCUS_ROLE,
  GRAPH_EDGE_KIND,
  formatEdgeKind,
  type EntityInspection,
  type FocusRole,
} from "./entityInspection";

export { FOCUS_ROLE };
export type { FocusRole };

const OVERLAY_COLUMN_SIZE = 8;
const OVERLAY_NODE_LIMIT = 36;
const FUNCTION_OFFSET_X = 280;
const FUNCTION_OFFSET_Y = 84;
const FUNCTION_COLUMN_WIDTH = 240;
const LABEL_EDGE_LIMIT = 28;
const DIMMED_OPACITY = 0.16;
const DEFAULT_STROKE = "#94a3b8";

const EDGE_STROKE: Record<string, string> = {
  [GRAPH_EDGE_KIND.DATA_FLOW]: "#14b8a6",
  [GRAPH_EDGE_KIND.CALLS]: "#3b82f6",
  [GRAPH_EDGE_KIND.DEPENDS_ON]: "#8b5cf6",
  [GRAPH_EDGE_KIND.STORES_IN]: "#f59e0b",
  [GRAPH_EDGE_KIND.CROSSES_TRUST_BOUNDARY]: "#ec4899",
  [GRAPH_EDGE_KIND.AUTHENTICATES]: "#10b981",
  [GRAPH_EDGE_KIND.AUTHORIZES]: "#10b981",
  [GRAPH_EDGE_KIND.RETRIEVES_FROM]: "#14b8a6",
  [GRAPH_EDGE_KIND.INVOKES_TOOL]: "#a78bfa",
};

export interface DiagramNodeInput {
  id: string;
  position: { x: number; y: number };
  data: {
    label: string;
    kind: string;
    description?: string;
  };
}

export interface DiagramEdgeInput {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: string;
}

export interface DiagramNodeView {
  id: string;
  position: { x: number; y: number };
  label: string;
  kind: string;
  description?: string;
  focusRole: FocusRole;
  opacity: number;
}

export interface DiagramEdgeView {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: string;
  focusRole: FocusRole;
  opacity: number;
  animated: boolean;
  stroke: string;
  showLabel: boolean;
}

export function presentFocusedFlow(input: {
  nodes: DiagramNodeInput[];
  edges: DiagramEdgeInput[];
  graph: ArchitectureGraph;
  inspection: EntityInspection | null;
}): { nodes: DiagramNodeView[]; edges: DiagramEdgeView[] } {
  const relatedNodes = new Set(input.inspection?.relatedNodeIds ?? []);
  const views: DiagramNodeView[] = input.nodes.map((node) => {
    const focusRole = roleForNode(node.id, input.inspection, relatedNodes);
    return {
      id: node.id,
      position: node.position,
      label: node.data.label,
      kind: node.data.kind,
      description: node.data.description,
      focusRole,
      opacity: focusRole === FOCUS_ROLE.DIMMED ? DIMMED_OPACITY : 1,
    };
  });

  if (input.inspection) {
    appendOverlayNodes(views, input.graph, input.inspection);
  }

  const visible = new Set(views.map((node) => node.id));
  const relatedEdges = new Set(input.inspection?.relatedEdgeIds ?? []);
  const edgeViews: DiagramEdgeView[] = [];
  const seen = new Set<string>();

  for (const edge of input.edges) {
    pushEdge(edgeViews, seen, visible, edge, input.inspection, relatedEdges);
  }
  if (input.inspection) {
    for (const edge of input.graph.edges) {
      if (!relatedEdges.has(edge.id)) {
        continue;
      }
      pushEdge(
        edgeViews,
        seen,
        visible,
        {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          kind: edge.kind,
        },
        input.inspection,
        relatedEdges,
      );
    }
  }

  const labeled = input.inspection ? edgeViews : applyIdleLabelLimit(edgeViews);
  return { nodes: views, edges: labeled };
}

function appendOverlayNodes(views: DiagramNodeView[], graph: ArchitectureGraph, inspection: EntityInspection): void {
  const placed = new Set(views.map((node) => node.id));
  const anchor = views.find((node) => node.id === inspection.nodeId);
  const origin = anchor?.position ?? { x: 40, y: 40 };
  const missing = orderedMissing(inspection, graph, placed).slice(0, OVERLAY_NODE_LIMIT);
  for (let index = 0; index < missing.length; index += 1) {
    const node = missing[index];
    if (!node) {
      continue;
    }
    const column = Math.floor(index / OVERLAY_COLUMN_SIZE);
    const row = index % OVERLAY_COLUMN_SIZE;
    views.push({
      id: node.id,
      position: {
        x: origin.x + FUNCTION_OFFSET_X + column * FUNCTION_COLUMN_WIDTH,
        y: origin.y + row * FUNCTION_OFFSET_Y,
      },
      label: node.label,
      kind: node.kind,
      description: node.description,
      focusRole: node.id === inspection.nodeId ? FOCUS_ROLE.FOCUS : FOCUS_ROLE.RELATED,
      opacity: 1,
    });
  }
}

function orderedMissing(inspection: EntityInspection, graph: ArchitectureGraph, placed: Set<string>): GraphNode[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const functionIds = new Set(inspection.functions.map((item) => item.id));
  const ids = inspection.relatedNodeIds.filter((id) => !placed.has(id));
  ids.sort((left, right) => {
    const rankDelta = rankMissing(left, inspection.nodeId, functionIds) - rankMissing(right, inspection.nodeId, functionIds);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return left.localeCompare(right);
  });
  const nodes: GraphNode[] = [];
  for (const id of ids) {
    const node = nodesById.get(id);
    if (node) {
      nodes.push(node);
    }
  }
  return nodes;
}

function rankMissing(nodeId: string, focusId: string, functionIds: Set<string>): number {
  if (nodeId === focusId) {
    return 0;
  }
  if (functionIds.has(nodeId)) {
    return 1;
  }
  return 2;
}

function pushEdge(
  edgeViews: DiagramEdgeView[],
  seen: Set<string>,
  visible: Set<string>,
  edge: DiagramEdgeInput,
  inspection: EntityInspection | null,
  relatedEdges: Set<string>,
): void {
  if (seen.has(edge.id) || !visible.has(edge.source) || !visible.has(edge.target)) {
    return;
  }
  seen.add(edge.id);
  const focusRole = roleForEdge(edge.id, inspection, relatedEdges);
  const focused = focusRole === FOCUS_ROLE.FOCUS;
  edgeViews.push({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label && edge.label.length > 0 ? edge.label : formatEdgeKind(edge.kind),
    kind: edge.kind,
    focusRole,
    opacity: focusRole === FOCUS_ROLE.DIMMED ? DIMMED_OPACITY : 1,
    animated: edge.kind === GRAPH_EDGE_KIND.DATA_FLOW && focusRole !== FOCUS_ROLE.DIMMED,
    stroke: EDGE_STROKE[edge.kind] ?? DEFAULT_STROKE,
    showLabel: inspection ? focused : true,
  });
}

function applyIdleLabelLimit(edges: DiagramEdgeView[]): DiagramEdgeView[] {
  return edges.map((edge, index) => ({
    ...edge,
    showLabel: index < LABEL_EDGE_LIMIT,
  }));
}

function roleForNode(nodeId: string, inspection: EntityInspection | null, relatedNodes: Set<string>): FocusRole {
  if (!inspection) {
    return FOCUS_ROLE.IDLE;
  }
  if (nodeId === inspection.nodeId) {
    return FOCUS_ROLE.FOCUS;
  }
  if (relatedNodes.has(nodeId)) {
    return FOCUS_ROLE.RELATED;
  }
  return FOCUS_ROLE.DIMMED;
}

function roleForEdge(edgeId: string, inspection: EntityInspection | null, relatedEdges: Set<string>): FocusRole {
  if (!inspection) {
    return FOCUS_ROLE.IDLE;
  }
  if (relatedEdges.has(edgeId)) {
    return FOCUS_ROLE.FOCUS;
  }
  return FOCUS_ROLE.DIMMED;
}
