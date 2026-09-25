export interface FlowNode {
  id: string;
  label: string;
}

export interface FlowEdge {
  sourceId: string;
  targetId: string;
  label: string;
}

export interface ArchitectureFlowModel {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const NODE_LINE = /^(\w+)\["([^"]*)"\]$/;
const EDGE_LINE = /^(\w+)\s+(?:-->|---)\|"?([^"|]*)"?\|\s+(\w+)$/;

export function parseArchitectureFlow(chart: string): ArchitectureFlowModel | null {
  const lines = chart
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const header = lines[0] ?? "";
  if (!/^flowchart\s+/i.test(header) && !/^graph\s+/i.test(header)) {
    return null;
  }
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  for (const line of lines.slice(1)) {
    const nodeMatch = NODE_LINE.exec(line);
    if (nodeMatch) {
      nodes.push({ id: nodeMatch[1] ?? "", label: nodeMatch[2] ?? "" });
      continue;
    }
    const edgeMatch = EDGE_LINE.exec(line);
    if (edgeMatch) {
      edges.push({
        sourceId: edgeMatch[1] ?? "",
        label: (edgeMatch[2] ?? "").trim() || "link",
        targetId: edgeMatch[3] ?? "",
      });
    }
  }
  if (nodes.length === 0) {
    return null;
  }
  return { nodes, edges };
}

export function quoteMermaidEdgeLabels(chart: string): string {
  return chart.replace(/-->\|(?!")([^|\n]+)\|/g, '-->|"$1"|').replace(/---\|(?!")([^|\n]+)\|/g, '---|"$1"|');
}
