import type { AnalystState, ArchitectureGraph, GraphEdge } from "@sentinel/schema";

const FLOW_KINDS = new Set(["data_flow", "stores_in", "retrieves_from", "invokes_tool", "authenticates", "authorizes", "crosses_trust_boundary"]);
export function buildDataFlowModel(graph: ArchitectureGraph, state: AnalystState, detail: boolean): ArchitectureGraph {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  for (const node of state.declaredNodes) nodes.set(node.id, node);
  const edges = [...graph.edges, ...state.declaredFlows].filter(edge => FLOW_KINDS.has(edge.kind)).filter(edge => !state.flows[edge.id]?.hidden).map(edge => {
    const annotation = state.flows[edge.id];
    return annotation?.label ? {...edge, label: annotation.label} : edge;
  });
  const visibleEdges = edges.filter(edge => {
    const source = nodes.get(edge.source), target = nodes.get(edge.target);
    return source && target && (detail || (source.kind !== "function" && target.kind !== "function"));
  });
  const used = new Set(visibleEdges.flatMap(edge => [edge.source, edge.target]));
  for (const node of nodes.values()) if (!node.id.startsWith("dep:") && (["actor", "data_store", "external_system", "ai_agent", "ai_model", "ai_tool", "trust_boundary"].includes(node.kind) || state.declaredNodes.some(item => item.id === node.id))) used.add(node.id);
  return {nodes: [...nodes.values()].filter(node => used.has(node.id)), edges: visibleEdges};
}
export function flowEvidenceLabel(edge: GraphEdge): string {
  return edge.provenance.kind === "user_declared" ? "Analyst declared" : edge.provenance.kind === "inferred" ? "Inferred · verify connection" : edge.provenance.kind === "observed" ? "Code construct · verify runtime path" : "Unknown basis";
}
export function dataFlowMermaid(graph: ArchitectureGraph, state: AnalystState): string {
  const clean = (value: string) => value.replace(/[\[\]{}<>"|\r\n\\]/g, " ").slice(0, 100);
  const ids = new Map(graph.nodes.map((node, index) => [node.id, "n" + index]));
  const lines = ["flowchart LR"];
  const zones = new Map<string, typeof graph.nodes>();
  for (const node of graph.nodes) {
    const zone = state.zones[node.id] || "Unassigned · boundary unknown";
    zones.set(zone, [...(zones.get(zone) ?? []), node]);
  }
  let index = 0;
  for (const [zone, nodes] of zones) {
    lines.push(`  subgraph z${index++}["${clean(zone)}"]`);
    for (const node of nodes) lines.push(`    ${ids.get(node.id)}["${clean(node.label)}"]`);
    lines.push("  end");
  }
  for (const edge of graph.edges) if (ids.has(edge.source) && ids.has(edge.target)) {
    lines.push(`  ${ids.get(edge.source)} ${edge.provenance.kind === "inferred" ? "-.->" : "-->"}|"${clean(edge.label || edge.kind)}"| ${ids.get(edge.target)}`);
  }
  return lines.join("\n");
}
