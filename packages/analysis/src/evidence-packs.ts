import { moduleNodeIdForPath } from "@sentinel/graph";
import type { ArchitectureGraph } from "@sentinel/schema";
import { AUDIT_AGENT } from "@sentinel/schema";
import type { InvestigationToolContext } from "./investigation-tools.js";
import { ToolName, executeInvestigationTool } from "./investigation-tools.js";
import { sanitizeRepositorySnippetForPrompt } from "./prompt-safety.js";

export const AUDIT_LIMITS = {
  SPECIALIST_ROUNDS: 2,
  TOOL_CALLS_PER_ROUND: 4,
  PREVIEW_LINES: 120,
  FULL_READ_LINES: 220,
  PACK_FILES: 8,
  READER_BATCH_FILES: 12,
  READER_BATCH_CHARS: 28_000,
  READER_ROUND_CAP: 12,
  SPECIALIST_REQUEST_RESERVE: 7,
  MANIFEST_PATHS: 800,
  GRAPH_NODES_IN_PROMPT: 80,
  GRAPH_EDGES_IN_PROMPT: 60,
  TOOL_RESULT_CHARS: 4_000,
} as const;

const AGENT_PATH_KEYWORDS: Record<(typeof AUDIT_AGENT)[keyof typeof AUDIT_AGENT], readonly string[]> = {
  [AUDIT_AGENT.CARTOGRAPHER]: ["package.json", "main", "app", "server", "route", "docker", "agent", "index"],
  [AUDIT_AGENT.STRIDE]: ["auth", "login", "session", "jwt", "guard", "middleware", "permission", "oauth"],
  [AUDIT_AGENT.OWASP]: ["route", "controller", "sql", "query", "html", "fetch", "cors", "csrf", "sanitize"],
  [AUDIT_AGENT.ATLAS]: ["agent", "prompt", "tool", "llm", "retriev", "embed", "memory", "openai", "langchain"],
  [AUDIT_AGENT.DATA]: ["prisma", "migration", "schema", "log", "pii", "secret", "env", "database"],
  [AUDIT_AGENT.INFRASTRUCTURE]: ["docker", "compose", "dockerfile", "kubernetes", "terraform", "workflow", "nginx", "helm"],
  [AUDIT_AGENT.CODE_READER]: [],
  [AUDIT_AGENT.PULL_REQUEST]: [],
  [AUDIT_AGENT.VERIFIER]: [],
};

export interface RankedPath {
  path: string;
  score: number;
}

export function scorePathForAgent(filePath: string, agentId: string): number {
  const keywords = AGENT_PATH_KEYWORDS[agentId as keyof typeof AGENT_PATH_KEYWORDS] ?? [];
  const lower = filePath.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lower.includes(keyword)) {
      score += 2;
    }
  }
  return score;
}

export function selectPathsForAgent(paths: string[], agentId: string, limit: number): string[] {
  const ranked: RankedPath[] = paths.map((path) => ({
    path,
    score: scorePathForAgent(path, agentId),
  }));
  ranked.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  const matched = ranked.filter((entry) => entry.score > 0).slice(0, limit);
  if (matched.length > 0 || agentId !== AUDIT_AGENT.CARTOGRAPHER) {
    return matched.map((entry) => entry.path);
  }
  return [...paths].sort((left, right) => left.localeCompare(right)).slice(0, limit);
}

export function buildPathManifest(paths: string[], limit: number): string {
  const visible = paths.slice(0, limit);
  const lines = visible.map((path) => `- ${path}`);
  const remainder = paths.length - visible.length;
  if (remainder > 0) {
    lines.push(`- ${remainder} additional indexed paths omitted from this manifest`);
  }
  return lines.join("\n");
}

export function summarizeArchitectureGraph(graph: ArchitectureGraph): string {
  const nodeLines: string[] = [];
  const nodeLimit = Math.min(graph.nodes.length, AUDIT_LIMITS.GRAPH_NODES_IN_PROMPT);
  for (let index = 0; index < nodeLimit; index += 1) {
    const node = graph.nodes[index];
    if (!node) {
      continue;
    }
    nodeLines.push(`${node.kind} ${node.id} ${node.label}`);
  }
  const edgeLines: string[] = [];
  const edgeLimit = Math.min(graph.edges.length, AUDIT_LIMITS.GRAPH_EDGES_IN_PROMPT);
  for (let index = 0; index < edgeLimit; index += 1) {
    const edge = graph.edges[index];
    if (!edge) {
      continue;
    }
    edgeLines.push(`${edge.kind} ${edge.source} -> ${edge.target}`);
  }
  const hiddenNodes = graph.nodes.length - nodeLines.length;
  const hiddenEdges = graph.edges.length - edgeLines.length;
  return [
    `nodes=${graph.nodes.length} edges=${graph.edges.length}`,
    ...nodeLines,
    hiddenNodes > 0 ? `${hiddenNodes} additional nodes omitted` : "",
    ...edgeLines,
    hiddenEdges > 0 ? `${hiddenEdges} additional edges omitted` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ToolObservation {
  path?: string;
  text: string;
}

export function readCoveragePreviews(
  context: InvestigationToolContext,
  paths: string[],
): { observations: ToolObservation[]; partialPaths: string[] } {
  const observations: ToolObservation[] = [];
  const partialPaths: string[] = [];
  for (const path of paths) {
    const content = context.contents.get(path) ?? "";
    const lineCount = content.length === 0 ? 0 : content.split("\n").length;
    const endLine = Math.min(Math.max(lineCount, 1), AUDIT_LIMITS.FULL_READ_LINES);
    if (lineCount > AUDIT_LIMITS.FULL_READ_LINES) {
      partialPaths.push(path);
    }
    const result = executeInvestigationTool(
      ToolName.READ_FILE_RANGE,
      { path, startLine: 1, endLine },
      context,
    );
    observations.push({
      path,
      text: sanitizeRepositorySnippetForPrompt(
        JSON.stringify(result).slice(0, AUDIT_LIMITS.TOOL_RESULT_CHARS),
      ),
    });
  }
  return { observations, partialPaths };
}

export function readPathPreviews(
  context: InvestigationToolContext,
  paths: string[],
): ToolObservation[] {
  const observations: ToolObservation[] = [];
  for (const path of paths) {
    const result = executeInvestigationTool(
      ToolName.READ_FILE_RANGE,
      { path, startLine: 1, endLine: AUDIT_LIMITS.PREVIEW_LINES },
      context,
    );
    observations.push({
      path,
      text: sanitizeRepositorySnippetForPrompt(
        JSON.stringify(result).slice(0, AUDIT_LIMITS.TOOL_RESULT_CHARS),
      ),
    });
  }
  return observations;
}

export function readEntryNeighborhood(context: InvestigationToolContext): ToolObservation | undefined {
  const entry = context.graph.nodes.find((node) => node.kind === "api_entry");
  if (!entry) {
    return undefined;
  }
  const result = executeInvestigationTool(
    ToolName.GET_GRAPH_NEIGHBORHOOD,
    { nodeId: entry.id, depth: 2 },
    context,
  );
  return {
    text: sanitizeRepositorySnippetForPrompt(
      JSON.stringify(result).slice(0, AUDIT_LIMITS.TOOL_RESULT_CHARS),
    ),
  };
}

export function moduleIdsForPaths(paths: string[], graph: ArchitectureGraph): string[] {
  const known = new Set(graph.nodes.map((node) => node.id));
  const linked: string[] = [];
  for (const path of paths) {
    const moduleId = moduleNodeIdForPath(path);
    if (known.has(moduleId)) {
      linked.push(moduleId);
    }
  }
  return linked;
}
