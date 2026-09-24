import { GRAPH_NODE_KIND, type ArchitectureGraph } from "@sentinel/schema";

const MAX_MERMAID_NODES = 24;
const MAX_MERMAID_EDGES = 36;
const LABEL_LIMIT = 80;

const NODE_PRIORITY: readonly string[] = [
  GRAPH_NODE_KIND.APPLICATION,
  GRAPH_NODE_KIND.SERVICE,
  GRAPH_NODE_KIND.API_ENTRY,
  GRAPH_NODE_KIND.DATA_STORE,
  GRAPH_NODE_KIND.EXTERNAL_SYSTEM,
  GRAPH_NODE_KIND.AI_AGENT,
  GRAPH_NODE_KIND.AI_MODEL,
  GRAPH_NODE_KIND.AI_TOOL,
  GRAPH_NODE_KIND.QUEUE,
  GRAPH_NODE_KIND.WORKER,
  GRAPH_NODE_KIND.MODULE,
  GRAPH_NODE_KIND.TRUST_BOUNDARY,
];

export function graphToMermaid(graph: ArchitectureGraph): string {
  const selected = selectNodes(graph);
  if (selected.length === 0) {
    return 'flowchart TD\n  empty["No architecture nodes were indexed"]';
  }
  const included = new Set(selected.map((node) => node.id));
  const idByNode = new Map(selected.map((node, index) => [node.id, `n${index}`]));
  const lines = ["flowchart TD"];
  for (const node of selected) {
    const mermaidId = idByNode.get(node.id);
    if (!mermaidId) {
      continue;
    }
    lines.push(`  ${mermaidId}["${escapeMermaidLabel(node.label)}"]`);
  }
  let edgeCount = 0;
  for (const edge of graph.edges) {
    if (edgeCount >= MAX_MERMAID_EDGES) {
      break;
    }
    if (!included.has(edge.source) || !included.has(edge.target)) {
      continue;
    }
    const sourceId = idByNode.get(edge.source);
    const targetId = idByNode.get(edge.target);
    if (!sourceId || !targetId) {
      continue;
    }
    const arrow = edge.bidirectional ? "---" : "-->";
    const label = edge.label?.trim() || edge.kind.replaceAll("_", " ");
    lines.push(`  ${sourceId} ${arrow}|${escapeMermaidLabel(label)}| ${targetId}`);
    edgeCount += 1;
  }
  return lines.join("\n");
}

export function sanitizeArchitectureMermaid(value: string): string | undefined {
  const stripped = value.replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!/^(?:flowchart|graph)\s+/i.test(stripped)) {
    return undefined;
  }
  if (stripped.length > 12_000) {
    return stripped.slice(0, 12_000);
  }
  return stripped;
}

function selectNodes(graph: ArchitectureGraph): ArchitectureGraph["nodes"] {
  const ranked = [...graph.nodes].sort((left, right) => priorityOf(left.kind) - priorityOf(right.kind));
  const selected: ArchitectureGraph["nodes"] = [];
  const seen = new Set<string>();
  for (const node of ranked) {
    if (selected.length >= MAX_MERMAID_NODES || seen.has(node.id)) {
      continue;
    }
    if (!NODE_PRIORITY.includes(node.kind) && selected.length > 0) {
      continue;
    }
    seen.add(node.id);
    selected.push(node);
  }
  return selected;
}

function priorityOf(kind: string): number {
  const index = NODE_PRIORITY.indexOf(kind);
  return index === -1 ? NODE_PRIORITY.length : index;
}

function escapeMermaidLabel(label: string): string {
  return label.replace(/["[\]|]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_LIMIT);
}
