import { GRAPH_NODE_KIND, type ArchitectureGraph, type GraphEdge, type GraphNode } from "@sentinel/schema";

export const GRAPH_EDGE_KIND = {
  DATA_FLOW: "data_flow",
  CALLS: "calls",
  DEPENDS_ON: "depends_on",
  AUTHENTICATES: "authenticates",
  AUTHORIZES: "authorizes",
  CROSSES_TRUST_BOUNDARY: "crosses_trust_boundary",
  RETRIEVES_FROM: "retrieves_from",
  INVOKES_TOOL: "invokes_tool",
  STORES_IN: "stores_in",
} as const;

export const RELATION_DIRECTION = {
  OUTGOING: "outgoing",
  INCOMING: "incoming",
} as const;

export const FOCUS_ROLE = {
  IDLE: "idle",
  FOCUS: "focus",
  RELATED: "related",
  DIMMED: "dimmed",
} as const;

export type FocusRole = (typeof FOCUS_ROLE)[keyof typeof FOCUS_ROLE];

export type RelationDirection = (typeof RELATION_DIRECTION)[keyof typeof RELATION_DIRECTION];

const METADATA_KEY = {
  PATH: "path",
  FILE: "file",
  FOLDER_PATH: "folderPath",
  START_LINE: "startLine",
} as const;

const PATH_DEPTH_LIMIT = 6;
const PATH_COUNT_LIMIT = 40;
const WALK_STACK_LIMIT = 400;
const EDGE_LIFT_PREFIX = "lift";

export const DIAGRAM_NODE_CAP = 160;

export interface InspectionFunction {
  id: string;
  label: string;
  path?: string;
  startLine?: number;
}

export interface EntityRelation {
  edgeId: string;
  kind: string;
  label: string;
  direction: RelationDirection;
  otherNodeId: string;
  otherLabel: string;
  otherKind: string;
}

export interface InspectionPathStep {
  nodeId: string;
  label: string;
  viaKind?: string;
  viaLabel?: string;
  edgeId?: string;
}

export interface EntityInspection {
  nodeId: string;
  label: string;
  kind: string;
  description?: string;
  functions: InspectionFunction[];
  dataFlows: EntityRelation[];
  dependencies: EntityRelation[];
  dependents: EntityRelation[];
  paths: InspectionPathStep[][];
  pathsTruncated: boolean;
  relatedNodeIds: string[];
  relatedEdgeIds: string[];
}

interface AdjacencyLink {
  to: string;
  edge: GraphEdge;
}

interface WalkBudget {
  remaining: number;
  truncated: boolean;
}

export function formatEdgeKind(kind: string): string {
  return kind.replaceAll("_", " ");
}

export function formatFunctionLocation(item: InspectionFunction): string {
  if (item.path && item.startLine) {
    return `${item.path}:${item.startLine}`;
  }
  if (item.path) {
    return item.path;
  }
  return "";
}

export function formatInspectionPath(steps: InspectionPathStep[]): string {
  const first = steps[0];
  if (!first) {
    return "";
  }
  let text = first.label;
  for (let index = 1; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step) {
      continue;
    }
    const via = step.viaLabel && step.viaLabel.length > 0 ? step.viaLabel : formatEdgeKind(step.viaKind ?? "");
    text = `${text} → ${via} → ${step.label}`;
  }
  return text;
}

export function resolveFocusNodeId(graph: ArchitectureGraph, nodeId: string): string {
  const match = graph.nodes.find((node) => node.id === nodeId);
  if (!match) {
    return nodeId;
  }
  if (match.kind !== GRAPH_NODE_KIND.FUNCTION || !match.parentId) {
    return nodeId;
  }
  const parent = graph.nodes.find((node) => node.id === match.parentId);
  return parent ? parent.id : nodeId;
}

export function buildEntityInspection(graph: ArchitectureGraph, nodeId: string): EntityInspection | null {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const entity = nodesById.get(nodeId);
  if (!entity) {
    return null;
  }

  const functionNodes = collectFunctions(graph, entity);
  const functions = functionNodes.map(toInspectionFunction);
  const anchorIds = new Set<string>([entity.id, ...functionNodes.map((node) => node.id)]);
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const { dataFlows, dependencies, dependents } = collectRelations(graph.edges, anchorIds, nodesById);
  const seeds = [entity.id, ...functionNodes.map((node) => node.id)];
  const { paths, truncated } = collectPaths(graph.edges, seeds, labels);
  const relatedNodeIds = new Set<string>([entity.id]);
  const relatedEdgeIds = new Set<string>();

  for (const node of functionNodes) {
    relatedNodeIds.add(node.id);
  }
  for (const relation of [...dataFlows, ...dependencies, ...dependents]) {
    relatedNodeIds.add(relation.otherNodeId);
    relatedEdgeIds.add(relation.edgeId);
  }
  for (const path of paths) {
    for (const step of path) {
      relatedNodeIds.add(step.nodeId);
      if (step.edgeId) {
        relatedEdgeIds.add(step.edgeId);
      }
    }
  }

  return {
    nodeId: entity.id,
    label: entity.label,
    kind: entity.kind,
    description: entity.description,
    functions,
    dataFlows,
    dependencies,
    dependents,
    paths,
    pathsTruncated: truncated,
    relatedNodeIds: [...relatedNodeIds],
    relatedEdgeIds: [...relatedEdgeIds],
  };
}

export function selectDiagramGraph(graph: ArchitectureGraph, nodeCap = DIAGRAM_NODE_CAP): ArchitectureGraph {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const components = graph.nodes.filter((node) => node.kind !== GRAPH_NODE_KIND.FUNCTION);
  const structural = components.filter((node) => node.kind !== GRAPH_NODE_KIND.MODULE);
  const modules = components.filter((node) => node.kind === GRAPH_NODE_KIND.MODULE);
  const connectedModules = modules.filter((node) => (degree.get(node.id) ?? 0) > 0);
  const modulePool = connectedModules.length > 0 ? connectedModules : modules;
  const rankedModules = rankByDegree(modulePool, degree);
  const rankedStructural = rankByDegree(structural, degree);

  let chosen: GraphNode[];
  if (rankedStructural.length >= nodeCap) {
    chosen = rankedStructural.slice(0, nodeCap);
  } else {
    chosen = [...rankedStructural, ...rankedModules.slice(0, nodeCap - rankedStructural.length)];
  }
  if (chosen.length === 0) {
    chosen = graph.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.FUNCTION).slice(0, nodeCap);
  }

  const visibleIds = new Set(chosen.map((node) => node.id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return {
    nodes: chosen,
    edges: liftVisibleEdges(graph.edges, nodesById, visibleIds),
  };
}

function collectFunctions(graph: ArchitectureGraph, entity: GraphNode): GraphNode[] {
  const functions = graph.nodes.filter(
    (node) => node.kind === GRAPH_NODE_KIND.FUNCTION && functionBelongsTo(node, entity),
  );
  functions.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  return functions;
}

function functionBelongsTo(fn: GraphNode, entity: GraphNode): boolean {
  if (fn.parentId === entity.id) {
    return true;
  }
  const functionPath = readMetadataString(fn.metadata, METADATA_KEY.PATH);
  if (!functionPath) {
    return false;
  }
  if (entity.kind === GRAPH_NODE_KIND.MODULE && functionPath === entity.label) {
    return true;
  }
  const file = readMetadataString(entity.metadata, METADATA_KEY.FILE);
  if (file && functionPath === file) {
    return true;
  }
  const folder = folderPrefixFor(entity);
  if (folder && (functionPath === folder || functionPath.startsWith(`${folder}/`))) {
    return true;
  }
  return false;
}

function folderPrefixFor(entity: GraphNode): string | undefined {
  const folderPath = readMetadataString(entity.metadata, METADATA_KEY.FOLDER_PATH);
  if (folderPath) {
    return folderPath;
  }
  if (entity.kind === GRAPH_NODE_KIND.SERVICE && entity.label.includes("/")) {
    return entity.label;
  }
  return undefined;
}

function toInspectionFunction(node: GraphNode): InspectionFunction {
  const path = readMetadataString(node.metadata, METADATA_KEY.PATH);
  const startLine = readMetadataNumber(node.metadata, METADATA_KEY.START_LINE);
  return {
    id: node.id,
    label: node.label,
    path,
    startLine,
  };
}

function collectRelations(
  edges: GraphEdge[],
  anchorIds: Set<string>,
  nodesById: Map<string, GraphNode>,
): { dataFlows: EntityRelation[]; dependencies: EntityRelation[]; dependents: EntityRelation[] } {
  const dataFlows: EntityRelation[] = [];
  const dependencies: EntityRelation[] = [];
  const dependents: EntityRelation[] = [];

  for (const edge of edges) {
    const sourceIn = anchorIds.has(edge.source);
    const targetIn = anchorIds.has(edge.target);
    if (!sourceIn && !targetIn) {
      continue;
    }
    if (edge.kind === GRAPH_EDGE_KIND.DATA_FLOW) {
      if (sourceIn) {
        dataFlows.push(toRelation(edge, RELATION_DIRECTION.OUTGOING, edge.target, nodesById));
      } else {
        dataFlows.push(toRelation(edge, RELATION_DIRECTION.INCOMING, edge.source, nodesById));
      }
      continue;
    }
    if (sourceIn) {
      dependencies.push(toRelation(edge, RELATION_DIRECTION.OUTGOING, edge.target, nodesById));
    }
    if (targetIn && !sourceIn) {
      dependents.push(toRelation(edge, RELATION_DIRECTION.INCOMING, edge.source, nodesById));
    }
  }

  return { dataFlows, dependencies, dependents };
}

function toRelation(
  edge: GraphEdge,
  direction: RelationDirection,
  otherId: string,
  nodesById: Map<string, GraphNode>,
): EntityRelation {
  const other = nodesById.get(otherId);
  return {
    edgeId: edge.id,
    kind: edge.kind,
    label: edge.label ?? "",
    direction,
    otherNodeId: otherId,
    otherLabel: other?.label ?? otherId,
    otherKind: other?.kind ?? "",
  };
}

function collectPaths(
  edges: GraphEdge[],
  seeds: string[],
  labels: Map<string, string>,
): { paths: InspectionPathStep[][]; truncated: boolean } {
  const outgoing = buildAdjacency(edges, false);
  const incoming = buildAdjacency(edges, true);
  const paths: InspectionPathStep[][] = [];
  const signatures = new Set<string>();
  let truncated = false;
  const budget: WalkBudget = { remaining: PATH_COUNT_LIMIT, truncated: false };

  for (const seed of seeds) {
    if (budget.remaining <= 0) {
      truncated = true;
      break;
    }
    const inbound = walkPaths(seed, incoming, labels, budget).map(reversePath);
    const outbound = walkPaths(seed, outgoing, labels, budget);
    const joined = joinSeedPaths(inbound, outbound);
    for (const steps of joined) {
      if (!rememberPath(paths, signatures, steps)) {
        truncated = true;
      }
    }
    if (budget.truncated) {
      truncated = true;
    }
  }

  return { paths, truncated };
}

function joinSeedPaths(incoming: InspectionPathStep[][], outgoing: InspectionPathStep[][]): InspectionPathStep[][] {
  if (incoming.length === 0) {
    return outgoing;
  }
  if (outgoing.length === 0) {
    return incoming;
  }
  const joined: InspectionPathStep[][] = [];
  for (const inbound of incoming) {
    const inboundIds = new Set(inbound.map((step) => step.nodeId));
    for (const outbound of outgoing) {
      const tail = outbound.slice(1);
      if (tail.some((step) => inboundIds.has(step.nodeId))) {
        joined.push(inbound, outbound);
        continue;
      }
      joined.push([...inbound, ...tail]);
    }
  }
  return joined;
}

function rememberPath(paths: InspectionPathStep[][], signatures: Set<string>, steps: InspectionPathStep[]): boolean {
  if (steps.length < 2) {
    return true;
  }
  const signature = steps.map((step) => `${step.edgeId ?? ""}:${step.nodeId}`).join(">");
  if (signatures.has(signature)) {
    return true;
  }
  if (paths.length >= PATH_COUNT_LIMIT) {
    return false;
  }
  signatures.add(signature);
  paths.push(steps);
  return true;
}

function walkPaths(
  startId: string,
  adjacency: Map<string, AdjacencyLink[]>,
  labels: Map<string, string>,
  budget: WalkBudget,
): InspectionPathStep[][] {
  const results: InspectionPathStep[][] = [];
  const stack: Array<{ nodeId: string; steps: InspectionPathStep[]; seen: Set<string> }> = [
    {
      nodeId: startId,
      steps: [{ nodeId: startId, label: labels.get(startId) ?? startId }],
      seen: new Set([startId]),
    },
  ];

  while (stack.length > 0) {
    if (budget.remaining <= 0 || stack.length > WALK_STACK_LIMIT) {
      budget.truncated = true;
      break;
    }
    const current = stack.pop();
    if (!current) {
      break;
    }
    const links = (adjacency.get(current.nodeId) ?? []).filter((link) => !current.seen.has(link.to));
    const depthReached = current.steps.length - 1 >= PATH_DEPTH_LIMIT;
    if (links.length === 0 || depthReached) {
      if (links.length > 0 && depthReached) {
        budget.truncated = true;
      }
      if (current.steps.length > 1) {
        results.push(current.steps);
        budget.remaining -= 1;
      }
      continue;
    }
    const ordered = [...links].sort((left, right) => right.to.localeCompare(left.to));
    for (const link of ordered) {
      const seen = new Set(current.seen);
      seen.add(link.to);
      stack.push({
        nodeId: link.to,
        seen,
        steps: [
          ...current.steps,
          {
            nodeId: link.to,
            label: labels.get(link.to) ?? link.to,
            viaKind: link.edge.kind,
            viaLabel: link.edge.label,
            edgeId: link.edge.id,
          },
        ],
      });
    }
  }

  return results;
}

function reversePath(steps: InspectionPathStep[]): InspectionPathStep[] {
  const reversed: InspectionPathStep[] = [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!step) {
      continue;
    }
    if (reversed.length === 0) {
      reversed.push({ nodeId: step.nodeId, label: step.label });
      continue;
    }
    const prior = steps[index + 1];
    reversed.push({
      nodeId: step.nodeId,
      label: step.label,
      viaKind: prior?.viaKind,
      viaLabel: prior?.viaLabel,
      edgeId: prior?.edgeId,
    });
  }
  return reversed;
}

function buildAdjacency(edges: GraphEdge[], inbound: boolean): Map<string, AdjacencyLink[]> {
  const adjacency = new Map<string, AdjacencyLink[]>();
  for (const edge of edges) {
    const from = inbound ? edge.target : edge.source;
    const to = inbound ? edge.source : edge.target;
    const links = adjacency.get(from) ?? [];
    links.push({ to, edge });
    adjacency.set(from, links);
  }
  return adjacency;
}

function rankByDegree(nodes: GraphNode[], degree: Map<string, number>): GraphNode[] {
  return [...nodes].sort((left, right) => {
    const delta = (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0);
    if (delta !== 0) {
      return delta;
    }
    return left.label.localeCompare(right.label);
  });
}

function liftVisibleEdges(
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>,
  visibleIds: Set<string>,
): GraphEdge[] {
  const buckets = new Map<string, GraphEdge & { count: number }>();
  for (const edge of edges) {
    const source = resolveVisibleAnchor(edge.source, nodesById, visibleIds);
    const target = resolveVisibleAnchor(edge.target, nodesById, visibleIds);
    if (!source || !target || source === target) {
      continue;
    }
    const lifted = source !== edge.source || target !== edge.target;
    const id = lifted ? `${EDGE_LIFT_PREFIX}:${source}->${target}:${edge.kind}` : edge.id;
    const existing = buckets.get(id);
    if (existing) {
      existing.count += 1;
      existing.label = `${existing.count} ${formatEdgeKind(edge.kind)}`;
      continue;
    }
    buckets.set(id, {
      ...edge,
      id,
      source,
      target,
      label: edge.label ?? formatEdgeKind(edge.kind),
      count: 1,
    });
  }
  return [...buckets.values()].map((bucket) => ({
    id: bucket.id,
    source: bucket.source,
    target: bucket.target,
    kind: bucket.kind,
    label: bucket.label,
    bidirectional: bucket.bidirectional,
    provenance: bucket.provenance,
  }));
}

function resolveVisibleAnchor(
  nodeId: string,
  nodesById: Map<string, GraphNode>,
  visibleIds: Set<string>,
): string | undefined {
  if (visibleIds.has(nodeId)) {
    return nodeId;
  }
  const parentId = nodesById.get(nodeId)?.parentId;
  if (parentId && visibleIds.has(parentId)) {
    return parentId;
  }
  return undefined;
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" ? value : undefined;
}
