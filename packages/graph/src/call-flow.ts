import {
  DATA_FLOW_ROLE,
  GRAPH_NODE_KIND,
  PROVENANCE_KIND,
  type ArchitectureGraph,
  type GraphEdge,
  type GraphNode,
} from "@sentinel/schema";

export interface ObservedDataFlowStep {
  role: (typeof DATA_FLOW_ROLE)[keyof typeof DATA_FLOW_ROLE];
  path: string;
  line: number;
  label: string;
}

export interface ObservedDataFlow {
  path: string;
  line: number;
  summary: string;
  steps: ObservedDataFlowStep[];
}

export interface CallFlowExtraction {
  nodes: GraphNode[];
  edges: GraphEdge[];
  flows: ObservedDataFlow[];
}

const MAX_FUNCTION_NODES = 80;
const MAX_FLOWS = 60;
const CALL_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "function",
  "return",
  "new",
  "typeof",
  "await",
  "super",
  "class",
  "import",
  "throw",
  "case",
  "do",
  "else",
  "try",
  "void",
  "delete",
  "in",
  "of",
]);

const SOURCE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:req|request)\.(?:body|query|params)\b/, label: "HTTP request input" },
  { pattern: /\b(?:ctx|context)\.(?:request|body|query|params)\b/, label: "HTTP request input" },
  { pattern: /\bsearchParams\b/, label: "URL search parameters" },
  { pattern: /\bprocess\.argv\b/, label: "Process arguments" },
];

const SINK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\beval\s*\(|\bnew\s+Function\s*\(/, label: "dynamic code execution" },
  { pattern: /innerHTML|dangerouslySetInnerHTML/, label: "HTML sink" },
  { pattern: /\$queryRaw|queryRawUnsafe|\.query\s*\(\s*`/, label: "SQL query sink" },
  { pattern: /\b(?:exec|execSync)\s*\(/, label: "command execution sink" },
  { pattern: /\bfetch\s*\(\s*[A-Za-z_$]|\baxios\.(?:get|post|put|patch|delete)\s*\(\s*[A-Za-z_$]/, label: "outbound request sink" },
];

const FUNCTION_NAME_PATTERN =
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;

const CALL_PATTERN = /\b([A-Za-z_$][\w$]*)\s*\(/g;

interface SourceHit {
  line: number;
  label: string;
}

interface SinkHit {
  line: number;
  label: string;
}

interface FunctionSpan {
  name: string;
  path: string;
  startLine: number;
  endLine: number;
  sources: SourceHit[];
  sinks: SinkHit[];
  calls: string[];
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}

function readFunctionName(line: string): string | null {
  const match = FUNCTION_NAME_PATTERN.exec(line);
  FUNCTION_NAME_PATTERN.lastIndex = 0;
  const name = match?.[1] ?? match?.[2];
  if (!name || CALL_KEYWORDS.has(name)) {
    return null;
  }
  return name;
}

function readSource(line: string): string | null {
  for (const source of SOURCE_PATTERNS) {
    if (source.pattern.test(line)) {
      source.pattern.lastIndex = 0;
      return source.label;
    }
    source.pattern.lastIndex = 0;
  }
  return null;
}

function readSink(line: string): string | null {
  for (const sink of SINK_PATTERNS) {
    if (sink.pattern.test(line)) {
      sink.pattern.lastIndex = 0;
      return sink.label;
    }
    sink.pattern.lastIndex = 0;
  }
  return null;
}

function readCalls(line: string): string[] {
  const names: string[] = [];
  CALL_PATTERN.lastIndex = 0;
  let match = CALL_PATTERN.exec(line);
  while (match) {
    const name = match[1] ?? "";
    if (name && !CALL_KEYWORDS.has(name) && !names.includes(name)) {
      names.push(name);
    }
    match = CALL_PATTERN.exec(line);
  }
  return names;
}

function countChar(line: string, character: string): number {
  let count = 0;
  for (const item of line) {
    if (item === character) {
      count += 1;
    }
  }
  return count;
}

function scanFunctions(path: string, content: string): FunctionSpan[] {
  const lines = content.split("\n");
  const spans: FunctionSpan[] = [];
  let current: FunctionSpan | null = null;
  let depth = 0;
  let functionDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    if (!current) {
      const name = readFunctionName(line);
      if (name) {
        current = {
          name,
          path,
          startLine: lineNumber,
          endLine: lineNumber,
          sources: [],
          sinks: [],
          calls: [],
        };
        functionDepth = depth;
      }
    }

    if (current) {
      const sourceLabel = readSource(line);
      if (sourceLabel) {
        current.sources.push({ line: lineNumber, label: sourceLabel });
      }
      const sinkLabel = readSink(line);
      if (sinkLabel) {
        current.sinks.push({ line: lineNumber, label: sinkLabel });
      }
      for (const callee of readCalls(line)) {
        if (callee !== current.name && !current.calls.includes(callee)) {
          current.calls.push(callee);
        }
      }
    }

    const arrowWithoutBlock =
      current !== null &&
      current.startLine === lineNumber &&
      line.includes("=>") &&
      !line.includes("{");
    depth += countChar(line, "{") - countChar(line, "}");
    if (current && (arrowWithoutBlock || (line.includes("}") && depth <= functionDepth))) {
      current.endLine = lineNumber;
      spans.push(current);
      current = null;
    }
  }

  if (current) {
    current.endLine = lines.length;
    spans.push(current);
  }
  return spans;
}

function functionNodeId(span: FunctionSpan): string {
  const safePath = span.path.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `fn:${safePath}:${span.name}:${span.startLine}`;
}

function buildFlows(spans: FunctionSpan[]): ObservedDataFlow[] {
  const sinksByName = new Map<string, FunctionSpan[]>();
  for (const span of spans) {
    if (span.sinks.length === 0) {
      continue;
    }
    const existing = sinksByName.get(span.name) ?? [];
    existing.push(span);
    sinksByName.set(span.name, existing);
  }

  const flows: ObservedDataFlow[] = [];
  for (const span of spans) {
    if (span.sources.length === 0 || flows.length >= MAX_FLOWS) {
      continue;
    }
    const source = span.sources[0];
    if (!source) {
      continue;
    }
    for (const sink of span.sinks) {
      if (flows.length >= MAX_FLOWS) {
        break;
      }
      flows.push({
        path: span.path,
        line: sink.line,
        summary: `${source.label} reaches ${sink.label} inside ${span.name}.`,
        steps: [
          { role: DATA_FLOW_ROLE.SOURCE, path: span.path, line: source.line, label: source.label },
          { role: DATA_FLOW_ROLE.SINK, path: span.path, line: sink.line, label: `${span.name}: ${sink.label}` },
        ],
      });
    }
    for (const calleeName of span.calls) {
      const callees = sinksByName.get(calleeName) ?? [];
      const callee = callees.length === 1 ? callees[0] : callees.find((item) => item.path === span.path);
      const calleeSink = callee?.sinks[0];
      if (!callee || !calleeSink || flows.length >= MAX_FLOWS) {
        continue;
      }
      flows.push({
        path: callee.path,
        line: calleeSink.line,
        summary: `${source.label} in ${span.name} calls ${callee.name}, which reaches ${calleeSink.label}.`,
        steps: [
          { role: DATA_FLOW_ROLE.SOURCE, path: span.path, line: source.line, label: source.label },
          { role: DATA_FLOW_ROLE.CALL, path: span.path, line: span.startLine, label: `${span.name} calls ${callee.name}` },
          { role: DATA_FLOW_ROLE.SINK, path: callee.path, line: calleeSink.line, label: `${callee.name}: ${calleeSink.label}` },
        ],
      });
    }
  }
  return flows;
}

function provenance(path: string, rationale: string, commitSha?: string) {
  return {
    kind: PROVENANCE_KIND.OBSERVED,
    confidence: 0.7,
    rationale,
    references: [{ path, commitSha }],
  };
}

export function extractCallFlows(files: Map<string, string>, commitSha?: string): CallFlowExtraction {
  const spans: FunctionSpan[] = [];
  for (const [path, content] of files) {
    if (!isSourceFile(path)) {
      continue;
    }
    spans.push(...scanFunctions(path, content));
  }

  const flows = buildFlows(spans);
  const linkedIds = new Set<string>();
  for (const flow of flows) {
    for (const step of flow.steps) {
      const span = spans.find(
        (item) => item.path === step.path && step.line >= item.startLine && step.line <= item.endLine,
      );
      if (span) {
        linkedIds.add(functionNodeId(span));
      }
    }
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const spansOnFlows = spans.filter((span) => linkedIds.has(functionNodeId(span))).slice(0, MAX_FUNCTION_NODES);
  const includedIds = new Set(spansOnFlows.map((span) => functionNodeId(span)));

  for (const span of spansOnFlows) {
    const id = functionNodeId(span);
    nodes.push({
      id,
      kind: GRAPH_NODE_KIND.FUNCTION,
      label: span.name,
      parentId: `module:${span.path.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      metadata: {
        path: span.path,
        startLine: span.startLine,
        endLine: span.endLine,
      },
      provenance: provenance(span.path, "Function participates in an observed source-to-sink chain", commitSha),
    });
  }

  for (const flow of flows) {
    const sourceStep = flow.steps.find((step) => step.role === DATA_FLOW_ROLE.SOURCE);
    const sinkStep = flow.steps.find((step) => step.role === DATA_FLOW_ROLE.SINK);
    if (!sourceStep || !sinkStep) {
      continue;
    }
    const sourceSpan = spans.find(
      (span) => span.path === sourceStep.path && sourceStep.line >= span.startLine && sourceStep.line <= span.endLine,
    );
    const sinkSpan = spans.find(
      (span) => span.path === sinkStep.path && sinkStep.line >= span.startLine && sinkStep.line <= span.endLine,
    );
    if (!sourceSpan || !sinkSpan) {
      continue;
    }
    const sourceId = functionNodeId(sourceSpan);
    const sinkId = functionNodeId(sinkSpan);
    if (!includedIds.has(sourceId) || !includedIds.has(sinkId)) {
      continue;
    }
    if (sourceId !== sinkId) {
      edges.push({
        id: `${sourceId}->${sinkId}:calls`,
        source: sourceId,
        target: sinkId,
        kind: "calls",
        label: `${sourceSpan.name} calls ${sinkSpan.name}`,
        bidirectional: false,
        provenance: provenance(sourceSpan.path, "Caller reaches a function that contains a sink", commitSha),
      });
    }
    edges.push({
      id: `${sourceId}->${sinkId}:data:${sinkStep.line}`,
      source: sourceId,
      target: sinkId,
      kind: "data_flow",
      label: flow.summary,
      bidirectional: false,
      provenance: provenance(sinkSpan.path, "Untrusted input reaches a sensitive sink", commitSha),
    });
  }

  return { nodes, edges, flows };
}

export function mergeCallFlows(graph: ArchitectureGraph, extraction: CallFlowExtraction): ArchitectureGraph {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  return {
    nodes: [...graph.nodes, ...extraction.nodes.filter((node) => !nodeIds.has(node.id))],
    edges: [...graph.edges, ...extraction.edges.filter((edge) => !edgeIds.has(edge.id))],
  };
}
