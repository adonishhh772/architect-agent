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

const STRUCTURAL_KINDS = new Set<string>([
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
]);

export function graphToMermaid(graph: ArchitectureGraph): string {
  const structural = graph.nodes.filter((node) => STRUCTURAL_KINDS.has(node.kind));
  const structuralIds = new Set(structural.map((node) => node.id));
  const connected = graph.edges.some((edge) => structuralIds.has(edge.source) && structuralIds.has(edge.target));
  if (structural.length > 0 && connected) {
    return renderDiagram(structural.slice(0, MAX_MERMAID_NODES), graph.edges);
  }
  const folders = folderDiagram(graph);
  if (folders) {
    return folders;
  }
  const selected = selectNodes(graph);
  if (selected.length === 0) {
    return 'flowchart TD\n  empty["No architecture nodes were indexed"]';
  }
  return renderDiagram(selected, graph.edges);
}

const MERMAID_HEADER = /^(?:flowchart|graph)\s+(?:TD|TB|LR|RL)\s*$/i;
const MERMAID_NODE = /^[A-Za-z][\w-]*\["[^"\n]*"\]$/;
const MERMAID_EDGE = /^[A-Za-z][\w-]*\s+(?:-->|---)(?:\|"?[^"|\n]{0,80}"?\|)?\s+[A-Za-z][\w-]*$/;

export function sanitizeArchitectureMermaid(value: string): string | undefined {
  const stripped = value.replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const lines = stripped.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const header = lines[0];
  if (!header || !MERMAID_HEADER.test(header) || lines.length > 80) {
    return undefined;
  }
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!MERMAID_NODE.test(line) && !MERMAID_EDGE.test(line)) {
      return undefined;
    }
  }
  return [header, ...lines.slice(1)].join("\n");
}

function renderDiagram(nodes: ArchitectureGraph["nodes"], edges: ArchitectureGraph["edges"]): string {
  const included = new Set(nodes.map((node) => node.id));
  const idByNode = new Map(nodes.map((node, index) => [node.id, `n${index}`]));
  const lines = ["flowchart TD"];
  for (const node of nodes) {
    const mermaidId = idByNode.get(node.id);
    if (!mermaidId) {
      continue;
    }
    lines.push(`  ${mermaidId}["${escapeMermaidLabel(shortLabel(node.label))}"]`);
  }
  let edgeCount = 0;
  for (const edge of edges) {
    if (edgeCount >= MAX_MERMAID_EDGES) {
      break;
    }
    if (!included.has(edge.source) || !included.has(edge.target)) {
      continue;
    }
    const sourceId = idByNode.get(edge.source);
    const targetId = idByNode.get(edge.target);
    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }
    const arrow = edge.bidirectional ? "---" : "-->";
    const label = edge.label?.trim() || edge.kind.replaceAll("_", " ");
    lines.push(`  ${sourceId} ${arrow}|"${escapeMermaidLabel(label)}"| ${targetId}`);
    edgeCount += 1;
  }
  return lines.join("\n");
}

function folderDiagram(graph: ArchitectureGraph): string | null {
  const modules = graph.nodes.filter((node) => node.kind === GRAPH_NODE_KIND.MODULE);
  if (modules.length < 2) {
    return null;
  }
  const folderByNode = new Map<string, string>();
  const folderOrder: string[] = [];
  for (const moduleNode of modules) {
    const folder = folderKey(moduleNode.label);
    folderByNode.set(moduleNode.id, folder);
    if (!folderOrder.includes(folder)) {
      folderOrder.push(folder);
    }
  }
  const visibleFolders = folderOrder.slice(0, 10);
  const visible = new Set(visibleFolders);
  const lines = ["flowchart TD"];
  visibleFolders.forEach((folder, index) => {
    lines.push(`  f${index}["${escapeMermaidLabel(folder)}"]`);
  });
  const folderIndex = new Map(visibleFolders.map((folder, index) => [folder, `f${index}`]));
  const seenEdges = new Set<string>();
  for (const edge of graph.edges) {
    const sourceFolder = folderByNode.get(edge.source);
    const targetFolder = folderByNode.get(edge.target);
    if (!sourceFolder || !targetFolder || sourceFolder === targetFolder) {
      continue;
    }
    if (!visible.has(sourceFolder) || !visible.has(targetFolder)) {
      continue;
    }
    const key = `${sourceFolder}->${targetFolder}`;
    if (seenEdges.has(key)) {
      continue;
    }
    seenEdges.add(key);
    const sourceId = folderIndex.get(sourceFolder);
    const targetId = folderIndex.get(targetFolder);
    if (!sourceId || !targetId) {
      continue;
    }
    lines.push(`  ${sourceId} -->|"imports"| ${targetId}`);
  }
  return lines.join("\n");
}

function folderKey(label: string): string {
  const parts = label.split("/").filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return parts[0] ?? label;
  }
  return parts.slice(0, -1).join("/");
}

function shortLabel(label: string): string {
  const parts = label.split("/").filter((part) => part.length > 0);
  if (parts.length <= 2) {
    return label;
  }
  return parts.slice(-2).join("/");
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
  return label.replace(/["[\]|(){}#<>;]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_LIMIT);
}
