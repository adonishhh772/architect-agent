import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { graphToFlowLayout } from "@sentinel/graph";
import type { ArchitectureGraph } from "@sentinel/schema";
import { useEffect, useMemo, useCallback } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { SentinelGraphNode } from "./SentinelGraphNode";

const nodeTypes = {
  sentinelNode: SentinelGraphNode,
};

interface ArchitectureMapProps {
  graph: ArchitectureGraph;
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  showDataFlows: boolean;
  showTrustBoundaries: boolean;
  layoutKey?: string;
}

const DAGRE_MAX_NODES = 120;

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
  graph.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });
  for (const node of nodes) {
    graph.setNode(node.id, { width: 220, height: 64 });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);
  return nodes.map((node) => {
    const position = graph.node(node.id);
    const x = typeof position?.x === "number" ? position.x - 110 : node.position.x;
    const y = typeof position?.y === "number" ? position.y - 32 : node.position.y;
    return {
      ...node,
      position: { x, y },
    };
  });
}

export function ArchitectureMap({
  graph,
  selectedNodeId,
  onSelectNode,
  showDataFlows,
  showTrustBoundaries,
  layoutKey = "default",
}: ArchitectureMapProps): JSX.Element {
  const layout = useMemo(() => graphToFlowLayout(graph), [graph]);
  const filteredEdges = useMemo(
    () =>
      layout.edges.filter((edge) => {
        if (!showDataFlows && edge.data?.kind === "data_flow") {
          return false;
        }
        if (!showTrustBoundaries && edge.data?.kind === "crosses_trust_boundary") {
          return false;
        }
        return true;
      }),
    [layout.edges, showDataFlows, showTrustBoundaries],
  );

  const initialNodes = useMemo(
    () =>
      layoutGraphNodes(
        layout.nodes.map((node) => ({
          ...node,
          selected: node.id === selectedNodeId,
          data: {
            ...node.data,
            onSelect: onSelectNode,
          },
        })),
        filteredEdges,
      ),
    [layout.nodes, filteredEdges, selectedNodeId, onSelectNode],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filteredEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(filteredEdges);
  }, [initialNodes, filteredEdges, setNodes, setEdges]);

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-xl border border-slate-200/60 dark:border-white/10">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
          minZoom={0.2}
          maxZoom={1.5}
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
