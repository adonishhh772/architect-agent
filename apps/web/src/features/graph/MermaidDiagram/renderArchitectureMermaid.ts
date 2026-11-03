import mermaid from "mermaid";
import { parseArchitectureFlow, quoteMermaidEdgeLabels } from "./architectureFlow";

const MERMAID_RENDER_ERROR = "The architecture diagram could not be drawn.";
const MARKUP_CHARACTERS = /[<>]/g;

// Mermaid 12 runs DOMPurify when securityLevel is strict and the SVG comes back empty.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "neutral",
  htmlLabels: false,
  suppressErrorRendering: true,
});

let renderSerial = 0;

export async function renderArchitectureMermaid(chart: string, fallbackChart: string | undefined): Promise<string> {
  const candidates = uniqueCharts([
    prepareArchitectureChart(chart),
    fallbackChart ? prepareArchitectureChart(fallbackChart) : "",
    rebuildArchitectureChart(chart) ?? "",
    fallbackChart ? rebuildArchitectureChart(fallbackChart) ?? "" : "",
  ]);
  let lastError: Error = new Error(MERMAID_RENDER_ERROR);
  for (const candidate of candidates) {
    try {
      return await drawMermaidChart(candidate);
    } catch (caught) {
      lastError = caught instanceof Error ? caught : lastError;
    }
  }
  throw lastError;
}

export function prepareArchitectureChart(chart: string): string {
  return quoteMermaidEdgeLabels(chart.replace(MARKUP_CHARACTERS, ""));
}

function rebuildArchitectureChart(chart: string): string | null {
  const model = parseArchitectureFlow(chart);
  if (!model) {
    return null;
  }
  const lines = ["flowchart TD"];
  for (const node of model.nodes) {
    lines.push(`  ${node.id}["${safeLabel(node.label)}"]`);
  }
  for (const edge of model.edges) {
    lines.push(`  ${edge.sourceId} -->|"${safeLabel(edge.label) || "link"}"| ${edge.targetId}`);
  }
  return lines.join("\n");
}

function safeLabel(label: string): string {
  return label.replace(/[<>"|[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueCharts(charts: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const chart of charts) {
    const trimmed = chart.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

async function drawMermaidChart(chart: string): Promise<string> {
  renderSerial += 1;
  const renderId = `architecture-map-${renderSerial}`;
  try {
    const rendered = await mermaid.render(renderId, chart);
    if (!rendered.svg.includes("<svg")) {
      throw new Error(MERMAID_RENDER_ERROR);
    }
    return rendered.svg;
  } finally {
    document.getElementById(renderId)?.remove();
    document.getElementById(`d${renderId}`)?.remove();
  }
}
