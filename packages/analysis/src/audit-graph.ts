import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import {
  AGENT_RUN_STATUS,
  AUDIT_AGENT,
  AUDIT_AGENT_ORDER,
  type AgentTraceEntry,
  type AnalysisReport,
  type AttackPath,
  type Finding,
} from "@sentinel/schema";
import type { AuditMemory } from "@sentinel/schema";
import {
  AGENT_ACTIVITY_STATUS,
  AGENT_ACTIVITY_TEXT,
  AGENT_STEP_KIND,
} from "./agent-activity.js";
import { AUDIT_MESSAGE, type AuditSpecialistOptions, type AuditSpecialistResult } from "./audit-specialist.js";
import { readCodeWindowBatch, runAuditSpecialist } from "./audit-specialist.js";
import { buildAuditMemory } from "./audit-memory.js";
import { resolveAttackPaths, verifyAuditFindings } from "./audit-verifier.js";
import { listUnreadPaths } from "./coverage-queue.js";
import { mapWithConcurrency } from "./map-with-concurrency.js";
import {
  AUDIT_LIMITS,
  buildPathManifest,
  summarizeArchitectureGraph,
} from "./evidence-packs.js";
import type { InvestigationToolContext } from "./investigation-tools.js";

const VERIFIER_DETAIL = "Citations checked against the indexed snapshot and linked to module nodes.";
const RISK_REVIEW_NODE = "risk_review";
const RISK_AGENTS = [
  AUDIT_AGENT.STRIDE,
  AUDIT_AGENT.OWASP,
  AUDIT_AGENT.ATLAS,
  AUDIT_AGENT.DATA,
  AUDIT_AGENT.INFRASTRUCTURE,
] as const;

const AuditAnnotation = Annotation.Root({
  architectureBrief: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => "",
  }),
  architectureMermaid: Annotation<string>({
    reducer: (left: string, right: string) => right || left,
    default: () => "",
  }),
  findings: Annotation<Finding[]>({
    reducer: mergeFindings,
    default: () => [],
  }),
  attackPaths: Annotation<AttackPath[]>({
    reducer: mergeAttackPaths,
    default: () => [],
  }),
  agentTrace: Annotation<AgentTraceEntry[]>({
    reducer: (left: AgentTraceEntry[], right: AgentTraceEntry[]) => [...left, ...right],
    default: () => [],
  }),
  overviewParts: Annotation<string[]>({
    reducer: (left: string[], right: string[]) => [...left, ...right],
    default: () => [],
  }),
  pathsRead: Annotation<string[]>({
    reducer: mergeUniqueStrings,
    default: () => [],
  }),
  pathsPartial: Annotation<string[]>({
    reducer: mergeUniqueStrings,
    default: () => [],
  }),
  readResume: Annotation<Record<string, number>>({
    reducer: (left: Record<string, number>, right: Record<string, number>) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  readColumns: Annotation<Record<string, number>>({
    reducer: (left: Record<string, number>, right: Record<string, number>) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  evidenceNotes: Annotation<string[]>({
    reducer: (left: string[], right: string[]) => [...left, ...right],
    default: () => [],
  }),
  continueReading: Annotation<boolean>({
    reducer: (_left: boolean, right: boolean) => right,
    default: () => false,
  }),
  readerRounds: Annotation<number>({
    reducer: (left: number, right: number) => left + right,
    default: () => 0,
  }),
});

type AuditGraphState = typeof AuditAnnotation.State;

export interface MultiAgentAuditOptions extends Omit<
  AuditSpecialistOptions,
  "agentId" | "architectureBrief" | "graphSummary" | "manifest" | "priorFindingKeys" | "context"
> {
  context: InvestigationToolContext;
  onPhase?: (message: string, completed: number, total: number) => void;
}

export interface MultiAgentAuditResult {
  findings: AnalysisReport["findings"];
  attackPaths: AnalysisReport["attackPaths"];
  architectureBrief?: string;
  architectureMermaid?: string;
  threatModelOverview?: string;
  agentTrace: AgentTraceEntry[];
  filesSampled: number;
  totalIndexedFiles: number;
  aiPassesCompleted: number;
  memory: AuditMemory;
}

export async function runMultiAgentAudit(options: MultiAgentAuditOptions): Promise<MultiAgentAuditResult> {
  const graphSummary = summarizeArchitectureGraph(options.context.graph);
  const manifest = buildPathManifest([...options.context.contents.keys()], AUDIT_LIMITS.MANIFEST_PATHS);
  const compiled = buildAuditGraph(options, graphSummary, manifest);
  const indexedFileCount = options.context.contents.size;
  const readerStepLimit = Math.max(AUDIT_LIMITS.MAX_READER_ROUNDS, indexedFileCount * AUDIT_LIMITS.WINDOWS_PER_FILE);
  const recursionLimit = readerStepLimit + AUDIT_AGENT_ORDER.length + 4;
  const state = await compiled.invoke({}, { recursionLimit });
  const completedPasses = state.agentTrace.filter(
    (entry) => entry.status === AGENT_RUN_STATUS.COMPLETED && entry.agentId !== AUDIT_AGENT.VERIFIER,
  ).length;

  return {
    findings: state.findings,
    attackPaths: state.attackPaths,
    architectureBrief: state.architectureBrief || undefined,
    architectureMermaid: state.architectureMermaid || undefined,
    threatModelOverview: state.overviewParts.filter(Boolean).join("\n\n") || undefined,
    agentTrace: state.agentTrace,
    filesSampled: state.pathsRead.length,
    totalIndexedFiles: options.context.contents.size,
    aiPassesCompleted: completedPasses,
    memory: buildAuditMemory({
      repositoryKey: options.repositoryKey ?? "repository",
      commitSha: options.commitSha,
      architectureBrief: state.architectureBrief || undefined,
      indexedPaths: [...options.context.contents.keys()],
      pathsRead: state.pathsRead,
      pathsPartial: state.pathsPartial,
      findings: state.findings,
      pullRequests: options.pullRequests ?? [],
      updatedAt: new Date().toISOString(),
    }),
  };
}

function buildAuditGraph(
  options: MultiAgentAuditOptions,
  graphSummary: string,
  manifest: string,
) {
  const graph = new StateGraph(AuditAnnotation)
    .addNode(AUDIT_AGENT.CARTOGRAPHER, createSpecialistNode(options, AUDIT_AGENT.CARTOGRAPHER, graphSummary, manifest))
    .addNode(AUDIT_AGENT.CODE_READER, createCodeReaderNode(options, graphSummary, manifest))
    .addNode(RISK_REVIEW_NODE, createParallelRiskNode(options, graphSummary, manifest))
    .addNode(AUDIT_AGENT.PULL_REQUEST, createSpecialistNode(options, AUDIT_AGENT.PULL_REQUEST, graphSummary, manifest))
    .addNode(AUDIT_AGENT.VERIFIER, createVerifierNode(options))
    .addEdge(START, AUDIT_AGENT.CODE_READER)
    .addConditionalEdges(AUDIT_AGENT.CODE_READER, routeAfterCodeReader)
    .addEdge(AUDIT_AGENT.CARTOGRAPHER, RISK_REVIEW_NODE)
    .addEdge(RISK_REVIEW_NODE, AUDIT_AGENT.PULL_REQUEST)
    .addEdge(AUDIT_AGENT.PULL_REQUEST, AUDIT_AGENT.VERIFIER)
    .addEdge(AUDIT_AGENT.VERIFIER, END);

  return graph.compile();
}

function createSpecialistNode(
  options: MultiAgentAuditOptions,
  agentId: (typeof AUDIT_AGENT_ORDER)[number],
  graphSummary: string,
  manifest: string,
) {
  return function specialistNode(state: AuditGraphState): Promise<Partial<AuditGraphState>> {
    return runNamedSpecialist(options, agentId, graphSummary, manifest, state);
  };
}

function createParallelRiskNode(
  options: MultiAgentAuditOptions,
  graphSummary: string,
  manifest: string,
) {
  const concurrency = options.provider.settings.maxConcurrency ?? 2;
  return async function riskNode(state: AuditGraphState): Promise<Partial<AuditGraphState>> {
    const updates = await mapWithConcurrency(RISK_AGENTS, concurrency, (agentId) =>
      runNamedSpecialist(options, agentId, graphSummary, manifest, state),
    );
    return {
      findings: updates.flatMap((update) => update.findings ?? []),
      attackPaths: updates.flatMap((update) => update.attackPaths ?? []),
      agentTrace: updates.flatMap((update) => update.agentTrace ?? []),
      overviewParts: updates.flatMap((update) => update.overviewParts ?? []),
      pathsRead: updates.flatMap((update) => update.pathsRead ?? []),
      pathsPartial: updates.flatMap((update) => update.pathsPartial ?? []),
    };
  };
}

async function runNamedSpecialist(
  options: MultiAgentAuditOptions,
  agentId: (typeof AUDIT_AGENT_ORDER)[number],
  graphSummary: string,
  manifest: string,
  state: AuditGraphState,
): Promise<Partial<AuditGraphState>> {
  const phaseIndex = AUDIT_AGENT_ORDER.indexOf(agentId);
  options.onPhase?.(`Agent: ${agentId}`, phaseIndex + 1, AUDIT_AGENT_ORDER.length);
  options.onAgentStep?.({
    agentId,
    status: AGENT_ACTIVITY_STATUS.RUNNING,
    kind: AGENT_STEP_KIND.ACTION,
    step: AGENT_ACTIVITY_TEXT.START,
  });
  try {
    const result = await runAuditSpecialist({
      ...options,
      agentId,
      architectureBrief: state.architectureBrief,
      graphSummary,
      manifest,
      priorFindingKeys: state.findings.map((finding) => finding.stableKey),
      sharedEvidence: state.evidenceNotes,
    });
    return specialistUpdate(result, state.architectureBrief);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Agent failed";
    options.onAgentStep?.({
      agentId,
      status: AGENT_ACTIVITY_STATUS.FAILED,
      kind: AGENT_STEP_KIND.ACTION,
      step: message,
    });
    return {
      agentTrace: [
        {
          agentId,
          status: AGENT_RUN_STATUS.FAILED,
          detail: message,
          toolCallCount: 0,
        },
      ],
    };
  }
}

function createCodeReaderNode(
  options: MultiAgentAuditOptions,
  graphSummary: string,
  manifest: string,
) {
  const indexedPaths = [...options.context.contents.keys()];
  return async function codeReaderNode(state: AuditGraphState): Promise<Partial<AuditGraphState>> {
    options.onPhase?.("Agent: code_reader", 1, AUDIT_AGENT_ORDER.length);
    options.onAgentStep?.({
      agentId: AUDIT_AGENT.CODE_READER,
      status: AGENT_ACTIVITY_STATUS.RUNNING,
      kind: AGENT_STEP_KIND.ACTION,
      step: AGENT_ACTIVITY_TEXT.START,
    });
    const unread = listUnreadPaths(indexedPaths, new Set(state.pathsRead));
    if (unread.length === 0) {
      options.onAgentStep?.({
        agentId: AUDIT_AGENT.CODE_READER,
        status: AGENT_ACTIVITY_STATUS.COMPLETED,
        kind: AGENT_STEP_KIND.ACTION,
        step: AUDIT_MESSAGE.READER_DONE,
      });
      return {
        continueReading: false,
        agentTrace: [
          {
            agentId: AUDIT_AGENT.CODE_READER,
            status: AGENT_RUN_STATUS.COMPLETED,
            detail: AUDIT_MESSAGE.READER_DONE,
            toolCallCount: 0,
          },
        ],
      };
    }
    try {
      const result = await readCodeWindowBatch(
        {
          ...options,
          agentId: AUDIT_AGENT.CODE_READER,
          architectureBrief: state.architectureBrief,
          graphSummary,
          manifest,
          priorFindingKeys: state.findings.map((finding) => finding.stableKey),
          alreadyRead: new Set(state.pathsRead),
          readResume: state.readResume,
          readColumns: state.readColumns,
        },
        AUDIT_LIMITS.READER_FANOUT,
      );
      const mergedRead = new Set([...state.pathsRead, ...result.pathsRead]);
      const stillUnread = listUnreadPaths(indexedPaths, mergedRead);
      const continueReading = shouldContinueReading(result.trace.status, stillUnread.length, state.readerRounds + 1, indexedPaths.length);
      return {
        ...specialistUpdate(result, state.architectureBrief),
        agentTrace: result.traces ?? [result.trace],
        continueReading,
        readerRounds: 1,
      };
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Code reader failed";
      options.onAgentStep?.({
        agentId: AUDIT_AGENT.CODE_READER,
        status: AGENT_ACTIVITY_STATUS.FAILED,
        kind: AGENT_STEP_KIND.ACTION,
        step: message,
      });
      return {
        continueReading: false,
        agentTrace: [
          {
            agentId: AUDIT_AGENT.CODE_READER,
            status: AGENT_RUN_STATUS.FAILED,
            detail: message,
            toolCallCount: 0,
          },
        ],
      };
    }
  };
}

function routeAfterCodeReader(state: AuditGraphState): string {
  return state.continueReading ? AUDIT_AGENT.CODE_READER : AUDIT_AGENT.CARTOGRAPHER;
}

export function shouldContinueReading(
  status: string,
  unreadCount: number,
  readerRounds: number,
  indexedFileCount = 0,
): boolean {
  const roundLimit = Math.max(AUDIT_LIMITS.MAX_READER_ROUNDS, indexedFileCount * AUDIT_LIMITS.WINDOWS_PER_FILE);
  return status === AGENT_RUN_STATUS.COMPLETED && unreadCount > 0 && readerRounds < roundLimit;
}

function createVerifierNode(options: MultiAgentAuditOptions) {
  const phaseIndex = AUDIT_AGENT_ORDER.indexOf(AUDIT_AGENT.VERIFIER);
  return function verifierNode(state: AuditGraphState): Partial<AuditGraphState> {
    options.onPhase?.("Agent: verifier", phaseIndex + 1, AUDIT_AGENT_ORDER.length);
    options.onAgentStep?.({
      agentId: AUDIT_AGENT.VERIFIER,
      status: AGENT_ACTIVITY_STATUS.RUNNING,
      kind: AGENT_STEP_KIND.ACTION,
      step: AGENT_ACTIVITY_TEXT.VERIFY_START,
    });
    const findings = verifyAuditFindings(state.findings, options.context.contents, options.context.graph);
    options.onAgentStep?.({
      agentId: AUDIT_AGENT.VERIFIER,
      status: AGENT_ACTIVITY_STATUS.COMPLETED,
      kind: AGENT_STEP_KIND.ACTION,
      step: VERIFIER_DETAIL,
    });
    return {
      findings,
      attackPaths: resolveAttackPaths(state.attackPaths, findings),
      agentTrace: [
        {
          agentId: AUDIT_AGENT.VERIFIER,
          status: AGENT_RUN_STATUS.COMPLETED,
          detail: VERIFIER_DETAIL,
          toolCallCount: findings.length,
        },
      ],
    };
  };
}

function specialistUpdate(result: AuditSpecialistResult, currentBrief: string): Partial<AuditGraphState> {
  return {
    architectureBrief: result.architectureBrief ?? currentBrief,
    architectureMermaid: result.architectureMermaid ?? "",
    findings: result.findings,
    attackPaths: result.attackPaths,
    agentTrace: [result.trace],
    overviewParts: result.overview ? [result.overview] : [],
    pathsRead: result.pathsRead,
    pathsPartial: result.pathsPartial,
    readResume: result.readResume ?? {},
    readColumns: result.readColumns ?? {},
    evidenceNotes: result.evidenceNotes ?? [],
  };
}

function mergeFindings(left: Finding[], right: Finding[]): Finding[] {
  const merged = new Map<string, Finding>();
  for (const finding of left) {
    merged.set(finding.stableKey, finding);
  }
  for (const finding of right) {
    merged.set(finding.stableKey, finding);
  }
  return [...merged.values()];
}

function mergeAttackPaths(left: AttackPath[], right: AttackPath[]): AttackPath[] {
  const merged = new Map<string, AttackPath>();
  for (const path of left) {
    merged.set(path.id, path);
  }
  for (const path of right) {
    merged.set(path.id, path);
  }
  return [...merged.values()];
}

function mergeUniqueStrings(left: string[], right: string[]): string[] {
  const seen = new Set(left);
  const merged = [...left];
  for (const value of right) {
    if (!seen.has(value)) {
      seen.add(value);
      merged.push(value);
    }
  }
  return merged;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
