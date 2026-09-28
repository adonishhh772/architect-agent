import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { graphToFlowLayout } from "@sentinel/graph";
import type { ArchitectureGraph } from "@sentinel/schema";
import { useEffect, useMemo, useCallback, type MouseEvent } from "react";
import { SentinelGraphNode } from "./SentinelGraphNode";
import { presentFocusedFlow } from "./diagramPresentation";
import { FOCUS_ROLE, GRAPH_EDGE_KIND, type EntityInspection } from "./entityInspection";

const nodeTypes = {
  sentinelNode: SentinelGraphNode,
};

interface ArchitectureMapProps {
  graph: ArchitectureGraph;
  focusGraph?: ArchitectureGraph;
  inspection?: EntityInspection | null;
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  onFocusNode?: (nodeId: string) => void;
  showDataFlows: boolean;
  showTrustBoundaries: boolean;
  layoutKey?: string;
}

const DAGRE_MAX_NODES = 180;

function FitViewWhenReady({ layoutKey }: { layoutKey: string }): null {
  const { fitView } = useReactFlow();
  const runFitView = useCallback(() => {
    void fitView({ padding: 0.2, maxZoom: 1.1, duration: 200 });
  }, [fitView]);

  useEffect(() => {
    const timer = window.setTimeout(runFitView, 50);
    return () => window.clearTimeout(timer);
  }, [layoutKey, runFitView]);

  return null;
}

function layoutGraphNodes(
  nodes: Node[],
  edges: ReturnType<typeof graphToFlowLayout>["edges"],
): Node[] {
  if (edges.length === 0 || nodes.length > DAGRE_MAX_NODES) {
    return nodes;
  }
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 70, ranksep: 120 });
  for (const node of nodes) {
    graph.setNode(node.id, { width: 220, height: 72 });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);
  return nodes.map((node) => {
    const position = graph.node(node.id);
    const x = typeof position?.x === "number" ? position.x - 110 : node.position.x;
    const y = typeof position?.y === "number" ? position.y - 36 : node.position.y;
    return {
      ...node,
      position: { x, y },
    };
  });
}

function readNodeText(data: unknown, key: string): string {
  if (!data || typeof data !== "object") {
    return "";
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function ArchitectureMap({
  graph,
  focusGraph,
  inspection = null,
  selectedNodeId,
  onSelectNode,
  onFocusNode,
  showDataFlows,
  showTrustBoundaries,
  layoutKey = "default",
}: ArchitectureMapProps): JSX.Element {
  const sourceGraph = focusGraph ?? graph;
  const layout = useMemo(() => graphToFlowLayout(graph), [graph]);
  const filteredEdges = useMemo(
    () =>
      layout.edges.filter((edge) => {
        if (!showDataFlows && edge.data?.kind === GRAPH_EDGE_KIND.DATA_FLOW) {
          return false;
        }
        if (!showTrustBoundaries && edge.data?.kind === GRAPH_EDGE_KIND.CROSSES_TRUST_BOUNDARY) {
          return false;
        }
        return true;
      }),
    [layout.edges, showDataFlows, showTrustBoundaries],
  );

  const laidOut = useMemo(
    () =>
      layoutGraphNodes(
        layout.nodes.map((node) => ({
          ...node,
          data: { ...node.data },
        })),
        filteredEdges,
      ),
    [layout.nodes, filteredEdges],
  );

  const presentation = useMemo(
    () =>
      presentFocusedFlow({
        nodes: laidOut.map((node) => {
          const description = readNodeText(node.data, "description");
          return {
            id: node.id,
            position: node.position,
            data: {
              label: readNodeText(node.data, "label"),
              kind: readNodeText(node.data, "kind"),
              description: description.length > 0 ? description : undefined,
            },
          };
        }),
        edges: filteredEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          kind: edge.data?.kind ?? "",
        })),
        graph: sourceGraph,
        inspection,
      }),
    [laidOut, filteredEdges, sourceGraph, inspection],
  );

  const flowNodes = useMemo(
    () =>
      presentation.nodes.map((node) => ({
        id: node.id,
        type: "sentinelNode",
        position: node.position,
        selected: node.id === selectedNodeId,
        zIndex: node.focusRole === FOCUS_ROLE.DIMMED ? 0 : 2,
        style: { opacity: node.opacity },
        data: {
          label: node.label,
          kind: node.kind,
          description: node.description,
          focusRole: node.focusRole,
          onSelect: onSelectNode,
        },
      })),
    [presentation.nodes, selectedNodeId, onSelectNode],
  );

  const flowEdges = useMemo(
    () =>
      presentation.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.showLabel ? edge.label : undefined,
        type: "smoothstep",
        animated: edge.animated,
        style: {
          stroke: edge.stroke,
          strokeWidth: edge.focusRole === FOCUS_ROLE.FOCUS ? 2.5 : 1.25,
          opacity: edge.opacity,
        },
        labelStyle: { fill: "var(--md-on-surface)", fontSize: 11, opacity: edge.opacity },
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.stroke },
        data: { kind: edge.kind },
      })),
    [presentation.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  function handleNodeMouseEnter(_event: MouseEvent, node: Node): void {
    onFocusNode?.(node.id);
  }

  return (
    <div
      className="h-[680px] w-full overflow-hidden rounded-xl border border-slate-200/60 bg-[#070714]/40 dark:border-white/10"
      data-testid="architecture-map"
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeMouseEnter={handleNodeMouseEnter}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
          minZoom={0.15}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <FitViewWhenReady layoutKey={layoutKey} />
          <MiniMap pannable zoomable />
          <Controls />
          <Background gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
