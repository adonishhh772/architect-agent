import { moduleNodeIdForPath } from "@sentinel/graph";
import type { ArchitectureGraph } from "@sentinel/schema";
import { AUDIT_AGENT } from "@sentinel/schema";
import type { InvestigationToolContext } from "./investigation-tools.js";
import { ToolName, executeInvestigationTool } from "./investigation-tools.js";
import { sanitizeRepositorySnippetForPrompt } from "./prompt-safety.js";

export const AUDIT_LIMITS = {
  SPECIALIST_ROUNDS: 2,
  TOOL_CALLS_PER_ROUND: 4,
  PREVIEW_LINES: 40,
  FULL_READ_LINES: 60,
  PACK_FILES: 1,
  READER_BATCH_FILES: 3,
  READER_BATCH_CHARS: 4_500,
  READER_FILES_PER_CALL: 1,
  READER_WINDOW_CHARS: 700,
  MANIFEST_PATHS: 24,
  READER_MANIFEST_PATHS: 8,
  MAX_READER_ROUNDS: 24,
  READER_FANOUT: 2,
  WINDOWS_PER_FILE: 40,
  GRAPH_NODES_IN_PROMPT: 16,
  GRAPH_EDGES_IN_PROMPT: 12,
  TOOL_RESULT_CHARS: 1_200,
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

export interface FileWindowRead {
  observations: ToolObservation[];
  finishedPaths: string[];
  partialPaths: string[];
  resumeLines: Record<string, number>;
  resumeColumns: Record<string, number>;
}

export function nextLineWindow(
  content: string,
  startLine: number,
  startColumn: number,
  maxSourceChars: number,
): { endLine: number; nextLine: number; nextColumn: number; source: string; done: boolean } {
  const lines = content.length === 0 ? [] : content.split("\n");
  if (lines.length === 0 || startLine > lines.length) {
    return { endLine: startLine, nextLine: 0, nextColumn: 0, source: "", done: true };
  }
  const included: string[] = [];
  let used = 0;
  let lineNumber = startLine;
  let column = Math.max(0, startColumn);
  let nextLine = startLine;
  let nextColumn = column;
  while (lineNumber <= lines.length && used < maxSourceChars) {
    const line = lines[lineNumber - 1] ?? "";
    const rest = line.slice(column);
    const room = maxSourceChars - used;
    if (rest.length <= room) {
      included.push(column === 0 ? line : rest);
      used += rest.length + 1;
      lineNumber += 1;
      column = 0;
      nextLine = lineNumber;
      nextColumn = 0;
      continue;
    }
    included.push(rest.slice(0, room));
    nextLine = lineNumber;
    nextColumn = column + room;
    used = maxSourceChars;
  }
  const done = nextColumn === 0 && nextLine > lines.length;
  return {
    endLine: done ? lines.length : lineNumber,
    nextLine: done ? 0 : nextLine,
    nextColumn,
    source: included.join("\n"),
    done,
  };
}

export function readCoveragePreviews(
  context: InvestigationToolContext,
  paths: string[],
): { observations: ToolObservation[]; partialPaths: string[] } {
  const windows = readFileWindows(context, paths, {});
  return { observations: windows.observations, partialPaths: windows.partialPaths };
}

export function readFileWindows(
  context: InvestigationToolContext,
  paths: string[],
  resumeLines: Readonly<Record<string, number>>,
  resumeColumns: Readonly<Record<string, number>> = {},
  maxSourceChars: number = AUDIT_LIMITS.TOOL_RESULT_CHARS,
): FileWindowRead {
  const observations: ToolObservation[] = [];
  const finishedPaths: string[] = [];
  const partialPaths: string[] = [];
  const nextResume: Record<string, number> = {};
  const nextColumns: Record<string, number> = {};
  for (const path of paths) {
    const content = context.contents.get(path) ?? "";
    const startLine = resumeLines[path] && resumeLines[path] > 0 ? resumeLines[path] : 1;
    const window = nextLineWindow(content, startLine, resumeColumns[path] ?? 0, maxSourceChars);
    nextResume[path] = window.nextLine;
    nextColumns[path] = window.nextColumn;
    if (window.done && window.source.length === 0) {
      finishedPaths.push(path);
      continue;
    }
    observations.push({
      path,
      text: sanitizeRepositorySnippetForPrompt(`${path}:${startLine}-${window.endLine}\n${window.source}`),
    });
    if (window.done) {
      finishedPaths.push(path);
    } else {
      partialPaths.push(path);
    }
  }
  return { observations, finishedPaths, partialPaths, resumeLines: nextResume, resumeColumns: nextColumns };
}

const SPECIALIST_PACK_AGENTS = new Set<string>([
  AUDIT_AGENT.STRIDE,
  AUDIT_AGENT.OWASP,
  AUDIT_AGENT.ATLAS,
  AUDIT_AGENT.DATA,
  AUDIT_AGENT.INFRASTRUCTURE,
]);

const UNOPENED_PREVIEW_LIMIT = 8;
const TRACE_DETAIL_LIMIT = 1900;

export function describeUnopenedFiles(indexedPaths: string[], openedPaths: string[]): string {
  const opened = new Set(openedPaths);
  const unopened: string[] = [];
  for (const path of indexedPaths) {
    if (!opened.has(path)) {
      unopened.push(path);
    }
  }
  const preview = unopened.slice(0, UNOPENED_PREVIEW_LIMIT);
  const moreCount = unopened.length - preview.length;
  const previewText = preview.length > 0 ? ` Unopened: ${preview.join(", ")}${moreCount > 0 ? `, and ${moreCount} more` : ""}.` : "";
  const detail = `Opened ${openedPaths.length} files. Did not open ${unopened.length} indexed files.${previewText}`;
  return detail.length <= TRACE_DETAIL_LIMIT ? detail : `${detail.slice(0, TRACE_DETAIL_LIMIT - 3)}...`;
}

export function isSpecialistPackAgent(agentId: string): boolean {
  return SPECIALIST_PACK_AGENTS.has(agentId);
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
