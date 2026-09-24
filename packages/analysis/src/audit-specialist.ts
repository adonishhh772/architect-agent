import type { AiProviderAdapter } from "@sentinel/providers";
import { parseJsonWithRepair } from "@sentinel/providers";
import {
  AGENT_RUN_STATUS,
  ATLAS_TECHNIQUE_LIST,
  AUDIT_AGENT,
  FINDING_CATEGORY,
  FINDING_STATUS,
  OWASP_CATEGORY_LIST,
  RISK_DOMAIN,
  RISK_DOMAIN_LIST,
  STRIDE_CATEGORY,
  type AgentTraceEntry,
  type AttackPath,
  type AuditMemory,
  type Finding,
} from "@sentinel/schema";
import type { PullRequestSnapshot } from "@sentinel/ingestion";
import { z } from "zod";
import { formatMemoryForPrompt } from "./audit-memory.js";
import { buildSpecialistSystemPrompt, buildSpecialistUserPrompt } from "./audit-prompts.js";
import { selectUnreadBatch } from "./coverage-queue.js";
import {
  AUDIT_LIMITS,
  readCoveragePreviews,
  readEntryNeighborhood,
  readPathPreviews,
  selectPathsForAgent,
  type ToolObservation,
} from "./evidence-packs.js";
import { ToolName, executeInvestigationTool, type InvestigationToolContext } from "./investigation-tools.js";
import {
  AGENT_ACTIVITY_STATUS,
  AGENT_ACTIVITY_TEXT,
  AGENT_STEP_KIND,
  describeEvidenceRead,
  describePassOutcome,
  describeReviewRound,
  describeThinking,
  describeToolActivity,
  type AgentActivityUpdate,
} from "./agent-activity.js";
import { sanitizeRepositorySnippetForPrompt } from "./prompt-safety.js";

const TOOL_NAME_LIST = [
  ToolName.LIST_FILES,
  ToolName.READ_FILE_RANGE,
  ToolName.SEARCH_CODE,
  ToolName.FIND_SYMBOL,
  ToolName.FIND_REFERENCES,
  ToolName.INSPECT_ROUTE,
  ToolName.INSPECT_CONFIGURATION,
  ToolName.GET_GRAPH_NEIGHBORHOOD,
  ToolName.FIND_CALLERS,
  ToolName.TRACE_DATA_FLOW,
] as const;

export const AUDIT_MESSAGE = {
  BUDGET_EXHAUSTED: "Request or token budget exhausted before this agent ran.",
  INVALID_MODEL_JSON: "Model response was not valid audit JSON.",
  COMPLETED: "Agent finished against its evidence pack.",
  NO_EVIDENCE: "The indexed snapshot has no files for this agent.",
  READER_RESERVE: "Stopped the full-repository reader so the threat-model specialists and pull-request review still have request budget.",
  READER_COMPLETE: "Read the next unread batch. Remaining files stay in memory until a later round or run.",
  READER_DONE: "Every indexed file was read or was already in memory.",
  NO_PULL_REQUESTS: "No open pull requests were available. ZIP uploads have no pull request API.",
} as const;

const DEFAULT_RISK_BY_AGENT: Record<string, Array<(typeof RISK_DOMAIN_LIST)[number]>> = {
  [AUDIT_AGENT.CARTOGRAPHER]: [RISK_DOMAIN.CYBERSECURITY],
  [AUDIT_AGENT.STRIDE]: [RISK_DOMAIN.CYBERSECURITY],
  [AUDIT_AGENT.OWASP]: [RISK_DOMAIN.CYBERSECURITY],
  [AUDIT_AGENT.ATLAS]: [RISK_DOMAIN.AI_EXECUTION],
  [AUDIT_AGENT.DATA]: [RISK_DOMAIN.DATA],
  [AUDIT_AGENT.INFRASTRUCTURE]: [RISK_DOMAIN.INFRASTRUCTURE],
};

const SpecialistResponseSchema = z.object({
  architectureBrief: z.string().max(12000).optional(),
  threatModelOverview: z.string().max(8000).optional(),
  toolCalls: z
    .array(
      z.object({
        tool: z.enum(TOOL_NAME_LIST),
        args: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(AUDIT_LIMITS.TOOL_CALLS_PER_ROUND)
    .optional(),
  findings: z
    .array(
      z.object({
        stableKey: z.string().min(1),
        title: z.string().min(1),
        category: z.enum([
          FINDING_CATEGORY.ARCHITECTURE,
          FINDING_CATEGORY.SECURITY,
          FINDING_CATEGORY.AI_SECURITY,
        ]),
        strideCategories: z.array(z.string()).optional(),
        owaspCategories: z.array(z.string()).optional(),
        atlasTechniqueIds: z.array(z.string()).optional(),
        riskDomains: z.array(z.string()).optional(),
        scenario: z.string(),
        mitigation: z.string(),
        preconditions: z.array(z.string()).optional(),
        trustBoundaryCrossings: z.array(z.string()).optional(),
        existingControls: z.array(z.string()).optional(),
        counterevidence: z.array(z.string()).optional(),
        openQuestions: z.array(z.string()).optional(),
        severityRationale: z.string().optional(),
        likelihoodRationale: z.string().optional(),
        confidence: z.number().min(0).max(1),
        references: z
          .array(
            z.object({
              path: z.string(),
              startLine: z.number().optional(),
              endLine: z.number().optional(),
            }),
          )
          .optional(),
      }),
    )
    .max(8)
    .optional(),
  attackPaths: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string(),
        stepStableKeys: z.array(z.string()).min(1),
      }),
    )
    .max(4)
    .optional(),
});

type SpecialistDraft = z.infer<typeof SpecialistResponseSchema>;

export interface AuditSpecialistOptions {
  agentId: string;
  context: InvestigationToolContext;
  provider: AiProviderAdapter;
  apiKey: string;
  signal?: AbortSignal;
  budget?: { maxRequests?: number; maxTokens?: number };
  architectureBrief: string;
  graphSummary: string;
  manifest: string;
  priorFindingKeys: string[];
  alreadyRead?: ReadonlySet<string>;
  pullRequests?: PullRequestSnapshot[];
  priorMemory?: AuditMemory;
  repositoryKey?: string;
  commitSha?: string;
  onUsage?: (usage: { totalTokens: number }) => void;
  getUsage?: () => { requestsUsed: number; tokensUsed: number };
  onAgentStep?: (update: AgentActivityUpdate) => void;
}

export interface AuditSpecialistResult {
  architectureBrief?: string;
  overview?: string;
  findings: Finding[];
  attackPaths: AttackPath[];
  pathsRead: string[];
  pathsPartial: string[];
  continueReading: boolean;
  trace: AgentTraceEntry;
}

export function runAuditSpecialist(options: AuditSpecialistOptions): Promise<AuditSpecialistResult> {
  return executeSpecialist(options);
}

async function executeSpecialist(options: AuditSpecialistOptions): Promise<AuditSpecialistResult> {
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!budgetAllowsRequest(options)) {
    return finishSpecialist(options, AGENT_RUN_STATUS.SKIPPED, AUDIT_MESSAGE.BUDGET_EXHAUSTED, 0);
  }

  const paths = [...options.context.contents.keys()];
  const alreadyRead = options.alreadyRead ?? new Set<string>();
  const selection = selectEvidenceForAgent(options.agentId, paths, alreadyRead, options.context, options.pullRequests);
  if (selection.skip) {
    return finishSpecialist(options, selection.status, selection.detail, 0);
  }
  const selected = selection.paths;
  const observations = selection.observations;
  const partialPaths = selection.partialPaths;
  if (options.agentId === AUDIT_AGENT.CARTOGRAPHER) {
    const neighborhood = readEntryNeighborhood(options.context);
    if (neighborhood) {
      observations.push(neighborhood);
    }
  }

  if (selected.length === 0 && observations.length === 0 && options.agentId !== AUDIT_AGENT.CARTOGRAPHER) {
    return finishSpecialist(options, AGENT_RUN_STATUS.SKIPPED, AUDIT_MESSAGE.NO_EVIDENCE, 0);
  }

  reportAgentStep(options, AGENT_ACTIVITY_STATUS.RUNNING, AGENT_STEP_KIND.ACTION, describeEvidenceRead(options.agentId, selected));

  const collectedFindings: Finding[] = [];
  const collectedPaths: AttackPath[] = [];
  let architectureBrief: string | undefined;
  let overview: string | undefined;
  let toolCallCount = observations.length;
  let followUpObservations: ToolObservation[] = [];

  for (let roundIndex = 0; roundIndex < AUDIT_LIMITS.SPECIALIST_ROUNDS; roundIndex += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (!budgetAllowsRequest(options)) {
      break;
    }

    reportAgentStep(
      options,
      AGENT_ACTIVITY_STATUS.RUNNING,
      AGENT_STEP_KIND.ACTION,
      describeReviewRound(roundIndex + 1),
    );

    const completion = await options.provider.complete(options.apiKey, {
      messages: [
        { role: "system", content: buildSpecialistSystemPrompt(options.agentId) },
        {
          role: "user",
          content: buildSpecialistUserPrompt({
            agentId: options.agentId,
            architectureBrief: options.architectureBrief,
            graphSummary: options.graphSummary,
            manifest: options.manifest,
            observations: [...observations, ...followUpObservations].map((item) => item.text),
            priorFindingKeys: options.priorFindingKeys,
            memoryText: formatMemoryForPrompt(options.priorMemory),
          }),
        },
      ],
      jsonSchema: {},
      maxOutputTokens: 8192,
    });
    options.onUsage?.(completion.usage);

    const parsed = parseJsonWithRepair(completion.text, SpecialistResponseSchema);
    if (!parsed.success) {
      return finishSpecialist(
        options,
        AGENT_RUN_STATUS.FAILED,
        AUDIT_MESSAGE.INVALID_MODEL_JSON,
        toolCallCount,
        selected,
      );
    }

    architectureBrief = parsed.data.architectureBrief ?? architectureBrief;
    overview = parsed.data.threatModelOverview ?? overview;
    if (parsed.data.threatModelOverview) {
      reportAgentStep(
        options,
        AGENT_ACTIVITY_STATUS.RUNNING,
        AGENT_STEP_KIND.THINKING,
        describeThinking(parsed.data.threatModelOverview),
      );
    }
    collectedFindings.push(...mapDraftFindings(parsed.data, options));
    collectedPaths.push(...mapDraftAttackPaths(parsed.data, options.agentId));

    const requestedTools = parsed.data.toolCalls ?? [];
    const continueWithTools =
      requestedTools.length > 0 &&
      collectedFindings.length === 0 &&
      roundIndex < AUDIT_LIMITS.SPECIALIST_ROUNDS - 1;
    if (!continueWithTools) {
      break;
    }
    for (const call of requestedTools.slice(0, AUDIT_LIMITS.TOOL_CALLS_PER_ROUND)) {
      reportAgentStep(
        options,
        AGENT_ACTIVITY_STATUS.RUNNING,
        AGENT_STEP_KIND.ACTION,
        describeToolActivity(call.tool, call.args),
      );
    }
    reportAgentStep(options, AGENT_ACTIVITY_STATUS.RUNNING, AGENT_STEP_KIND.ACTION, AGENT_ACTIVITY_TEXT.FOLLOW_UP);
    followUpObservations = executeRequestedTools(requestedTools, options.context);
    toolCallCount += followUpObservations.length;
  }

  const detail = options.agentId === AUDIT_AGENT.CODE_READER ? AUDIT_MESSAGE.READER_COMPLETE : AUDIT_MESSAGE.COMPLETED;
  reportAgentStep(
    options,
    AGENT_ACTIVITY_STATUS.COMPLETED,
    AGENT_STEP_KIND.ACTION,
    describePassOutcome(collectedFindings.length, detail),
  );
  return {
    architectureBrief,
    overview,
    findings: collectedFindings,
    attackPaths: collectedPaths,
    pathsRead: selected,
    pathsPartial: partialPaths,
    continueReading: false,
    trace: {
      agentId: options.agentId,
      status: AGENT_RUN_STATUS.COMPLETED,
      detail,
      toolCallCount,
    },
  };
}

function reportAgentStep(
  options: AuditSpecialistOptions,
  status: AgentActivityUpdate["status"],
  kind: AgentActivityUpdate["kind"],
  step: string,
): void {
  options.onAgentStep?.({ agentId: options.agentId, status, kind, step });
}

function finishSpecialist(
  options: AuditSpecialistOptions,
  status: AgentTraceEntry["status"],
  detail: string,
  toolCallCount: number,
  pathsRead: string[] = [],
): AuditSpecialistResult {
  reportAgentStep(options, status, AGENT_STEP_KIND.ACTION, detail);
  return emptyResult(options.agentId, status, detail, toolCallCount, pathsRead);
}

function budgetAllowsRequest(options: AuditSpecialistOptions): boolean {
  const usage = options.getUsage?.() ?? { requestsUsed: 0, tokensUsed: 0 };
  if (options.budget?.maxRequests !== undefined && usage.requestsUsed >= options.budget.maxRequests) {
    return false;
  }
  if (options.budget?.maxTokens !== undefined && usage.tokensUsed >= options.budget.maxTokens) {
    return false;
  }
  return true;
}

function emptyResult(
  agentId: string,
  status: AgentTraceEntry["status"],
  detail: string,
  toolCallCount: number,
  pathsRead: string[] = [],
): AuditSpecialistResult {
  return {
    findings: [],
    attackPaths: [],
    pathsRead,
    pathsPartial: [],
    continueReading: false,
    trace: { agentId, status, detail, toolCallCount },
  };
}

interface EvidenceSelection {
  paths: string[];
  observations: ToolObservation[];
  partialPaths: string[];
  skip: boolean;
  status: AgentTraceEntry["status"];
  detail: string;
}

function selectEvidenceForAgent(
  agentId: string,
  paths: string[],
  alreadyRead: ReadonlySet<string>,
  context: InvestigationToolContext,
  pullRequests: PullRequestSnapshot[] | undefined,
): EvidenceSelection {
  if (agentId === AUDIT_AGENT.PULL_REQUEST) {
    if (!pullRequests || pullRequests.length === 0) {
      return {
        paths: [],
        observations: [],
        partialPaths: [],
        skip: true,
        status: AGENT_RUN_STATUS.SKIPPED,
        detail: AUDIT_MESSAGE.NO_PULL_REQUESTS,
      };
    }
    return {
      paths: [],
      observations: pullRequests.map((pullRequest) => ({
        text: sanitizeRepositorySnippetForPrompt(formatPullRequest(pullRequest)),
      })),
      partialPaths: [],
      skip: false,
      status: AGENT_RUN_STATUS.COMPLETED,
      detail: AUDIT_MESSAGE.COMPLETED,
    };
  }

  if (agentId === AUDIT_AGENT.CODE_READER) {
    if (listHasUnread(paths, alreadyRead)) {
      const selected = selectUnreadBatch(paths, alreadyRead, context.contents);
      const coverage = readCoveragePreviews(context, selected);
      return {
        paths: selected,
        observations: coverage.observations,
        partialPaths: coverage.partialPaths,
        skip: selected.length === 0,
        status: AGENT_RUN_STATUS.COMPLETED,
        detail: selected.length === 0 ? AUDIT_MESSAGE.READER_DONE : AUDIT_MESSAGE.READER_COMPLETE,
      };
    }
    return {
      paths: [],
      observations: [],
      partialPaths: [],
      skip: true,
      status: AGENT_RUN_STATUS.COMPLETED,
      detail: AUDIT_MESSAGE.READER_DONE,
    };
  }

  const focused = selectPathsForAgent(paths, agentId, AUDIT_LIMITS.PACK_FILES);
  const selected = focused.length > 0 ? focused : selectUnreadBatch(paths, new Set<string>(), context.contents, AUDIT_LIMITS.PACK_FILES);
  const coverage = readCoveragePreviews(context, selected);
  return {
    paths: selected,
    observations: coverage.observations.length > 0 ? coverage.observations : readPathPreviews(context, selected),
    partialPaths: coverage.partialPaths,
    skip: false,
    status: AGENT_RUN_STATUS.COMPLETED,
    detail: AUDIT_MESSAGE.COMPLETED,
  };
}

function listHasUnread(paths: string[], alreadyRead: ReadonlySet<string>): boolean {
  for (const path of paths) {
    if (!alreadyRead.has(path)) {
      return true;
    }
  }
  return false;
}

function formatPullRequest(pullRequest: PullRequestSnapshot): string {
  const files = pullRequest.files.map((file) => {
    const patch = file.patch ? `\n${file.patch}` : "";
    return `${file.status} ${file.filename}${patch}`;
  });
  return [`Pull request #${pullRequest.number} (${pullRequest.state}): ${pullRequest.title}`, ...files].join("\n");
}

function executeRequestedTools(
  calls: NonNullable<SpecialistDraft["toolCalls"]>,
  context: InvestigationToolContext,
): ToolObservation[] {
  const observations: ToolObservation[] = [];
  const limited = calls.slice(0, AUDIT_LIMITS.TOOL_CALLS_PER_ROUND);
  for (const call of limited) {
    try {
      const result = executeInvestigationTool(call.tool, call.args ?? {}, context);
      observations.push({
        text: sanitizeRepositorySnippetForPrompt(
          JSON.stringify(result).slice(0, AUDIT_LIMITS.TOOL_RESULT_CHARS),
        ),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "invalid tool arguments";
      observations.push({ text: `${call.tool}: ${message}` });
    }
  }
  return observations;
}

function mapDraftFindings(draft: SpecialistDraft, options: AuditSpecialistOptions): Finding[] {
  return (draft.findings ?? []).map((item) => ({
    id: `finding-${options.agentId}-${item.stableKey}`,
    stableKey: item.stableKey.startsWith(`${options.agentId}-`)
      ? item.stableKey
      : `${options.agentId}-${item.stableKey}`,
    title: item.title,
    category: item.category,
    strideCategories: filterEnum(item.strideCategories, STRIDE_CATEGORY),
    owaspCategories: filterList(item.owaspCategories, OWASP_CATEGORY_LIST),
    atlasTechniqueIds: filterList(item.atlasTechniqueIds, ATLAS_TECHNIQUE_LIST),
    riskDomains: riskDomainsFor(item.riskDomains, options.agentId),
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    affectedNodeIds: [],
    affectedAssetSummary: item.references?.[0]?.path ?? "unknown",
    commitSha: options.commitSha,
    references: (item.references ?? []).map((reference) => ({
      path: reference.path,
      startLine: reference.startLine,
      endLine: reference.endLine,
      commitSha: options.commitSha,
    })),
    evidence: [],
    scenario: item.scenario,
    preconditions: item.preconditions ?? [],
    trustBoundaryCrossings: item.trustBoundaryCrossings ?? [],
    existingControls: item.existingControls ?? [],
    counterevidence: item.counterevidence ?? [],
    confidence: item.confidence,
    severityRationale: item.severityRationale ?? "AI-assisted hypothesis; confirm with testing.",
    likelihoodRationale: item.likelihoodRationale ?? "Based on indexed repository evidence.",
    assumptions: ["AI-generated finding requires verification"],
    openQuestions: item.openQuestions ?? [],
    mitigation: item.mitigation,
    relatedFindingIds: [],
    attackPathIds: [],
  }));
}

function mapDraftAttackPaths(draft: SpecialistDraft, agentId: string): AttackPath[] {
  return (draft.attackPaths ?? []).map((path) => ({
    id: path.id.startsWith(`${agentId}-`) ? path.id : `${agentId}-${path.id}`,
    title: path.title,
    description: path.description,
    stepFindingIds: path.stepStableKeys,
    prerequisiteFindingIds: [],
    unsupportedLinks: path.stepStableKeys,
  }));
}

function filterEnum<T extends Record<string, string>>(
  values: string[] | undefined,
  catalog: T,
): Array<T[keyof T]> {
  const allowed = new Set(Object.values(catalog));
  return (values ?? []).filter((value): value is T[keyof T] => allowed.has(value));
}

function filterList<T extends readonly string[]>(
  values: string[] | undefined,
  allowedValues: T,
): Array<T[number]> {
  const allowed = new Set<string>(allowedValues);
  return (values ?? []).filter((value): value is T[number] => allowed.has(value));
}

function riskDomainsFor(
  values: string[] | undefined,
  agentId: string,
): Array<(typeof RISK_DOMAIN_LIST)[number]> {
  const filtered = filterList(values, RISK_DOMAIN_LIST);
  if (filtered.length > 0) {
    return filtered;
  }
  return DEFAULT_RISK_BY_AGENT[agentId] ?? [RISK_DOMAIN.CYBERSECURITY];
}
