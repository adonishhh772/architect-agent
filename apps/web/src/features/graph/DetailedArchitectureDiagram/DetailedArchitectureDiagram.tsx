import { GRAPH_NODE_KIND, type ArchitectureGraph } from "@sentinel/schema";
import { useMemo, useState } from "react";
import { ArchitectureMap } from "../ArchitectureMap";
import { EntityInspector } from "../EntityInspector";
import { GRAPH_EDGE_KIND, buildEntityInspection, resolveFocusNodeId, selectDiagramGraph } from "../entityInspection";

const DIAGRAM_HINT =
  "Hover a component to isolate its functions, data flows, and every dependency path. The detail stays until you hover another component.";

const EMPTY_DIAGRAM = "No architecture components were indexed from this repository.";

const LEGEND: Array<{ kind: string; label: string; swatch: string }> = [
  { kind: GRAPH_EDGE_KIND.DATA_FLOW, label: "Data flow", swatch: "bg-teal-400" },
  { kind: GRAPH_EDGE_KIND.CALLS, label: "Calls", swatch: "bg-blue-400" },
  { kind: GRAPH_EDGE_KIND.DEPENDS_ON, label: "Depends on", swatch: "bg-violet-400" },
  { kind: GRAPH_EDGE_KIND.STORES_IN, label: "Stores in", swatch: "bg-amber-400" },
  { kind: GRAPH_EDGE_KIND.CROSSES_TRUST_BOUNDARY, label: "Trust boundary", swatch: "bg-pink-400" },
];

interface DetailedArchitectureDiagramProps {
  graph: ArchitectureGraph;
  onSelectLabel: (label: string) => void;
}

export function DetailedArchitectureDiagram({
  graph,
  onSelectLabel,
}: DetailedArchitectureDiagramProps): JSX.Element {
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(undefined);
  const displayGraph = useMemo(() => selectDiagramGraph(graph), [graph]);
  const inspection = useMemo(
    () => (focusedNodeId ? buildEntityInspection(graph, focusedNodeId) : null),
    [graph, focusedNodeId],
  );

  function handleFocusNode(nodeId: string): void {
    const focusId = resolveFocusNodeId(graph, nodeId);
    setFocusedNodeId(focusId);
    const match = graph.nodes.find((node) => node.id === focusId);
    if (match) {
      onSelectLabel(match.label);
    }
  }

  if (graph.nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="architecture-diagram-empty">
        {EMPTY_DIAGRAM}
      </p>
    );
  }

  const summary = describeDiagram({
    componentCount: displayGraph.nodes.length,
    functionCount: graph.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.FUNCTION).length,
    dataFlowCount: graph.edges.filter((edge) => edge.kind === GRAPH_EDGE_KIND.DATA_FLOW).length,
    omittedCount: countOmittedComponents(graph, displayGraph),
  });

  return (
    <div className="space-y-3" data-testid="detailed-architecture-diagram">
      <p className="text-sm text-[var(--md-on-surface-variant)]">{summary}</p>
      <EdgeLegend />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <ArchitectureMap
          graph={displayGraph}
          focusGraph={graph}
          inspection={inspection}
          onFocusNode={handleFocusNode}
          selectedNodeId={focusedNodeId}
          onSelectNode={handleFocusNode}
          showDataFlows
          showTrustBoundaries
          layoutKey={`detail-${displayGraph.nodes.length}-${displayGraph.edges.length}`}
        />
        <EntityInspector inspection={inspection} />
      </div>
    </div>
  );
}

function describeDiagram(counts: {
  componentCount: number;
  functionCount: number;
  dataFlowCount: number;
  omittedCount: number;
}): string {
  const parts = [`${counts.componentCount} components on the map`];
  if (counts.functionCount > 0) {
    parts.push(`${counts.functionCount} functions appear when you hover their component`);
  }
  if (counts.dataFlowCount > 0) {
    parts.push(`${counts.dataFlowCount} indexed data flows`);
  }
  if (counts.omittedCount > 0) {
    parts.push(`${counts.omittedCount} components are hidden so the connected architecture stays readable`);
  }
  return `${parts.join(" · ")}. ${DIAGRAM_HINT}`;
}

function countOmittedComponents(graph: ArchitectureGraph, displayGraph: ArchitectureGraph): number {
  const visibleIds = new Set(displayGraph.nodes.map((node) => node.id));
  let omittedCount = 0;
  for (const node of graph.nodes) {
    if (node.kind !== GRAPH_NODE_KIND.FUNCTION && !visibleIds.has(node.id)) {
      omittedCount += 1;
    }
  }
  return omittedCount;
}

function EdgeLegend(): JSX.Element {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-[var(--md-on-surface-variant)]" data-testid="architecture-edge-legend">
      {LEGEND.map(renderLegendItem)}
    </ul>
  );
}

function renderLegendItem(item: { kind: string; label: string; swatch: string }): JSX.Element {
  return (
    <li key={item.kind} className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${item.swatch}`} aria-hidden />
      {item.label}
    </li>
  );
}
