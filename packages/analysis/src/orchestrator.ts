import { buildArchitectureProfile, extractArchitecture, extractCallFlows } from "@sentinel/graph";
import type { AiProviderAdapter } from "@sentinel/providers";
import {
  AGENT_RUN_STATUS,
  ANALYSIS_MODE,
  AUDIT_AGENT_ORDER,
  DEFAULT_DISCLAIMER,
  type AgentTraceEntry,
  type AnalysisReport,
  type AuditMemory,
  type CoverageEntry,
  type DataFlow,
  type Finding,
  type RepositoryMetadata,
} from "@sentinel/schema";
import { fetchOpenPullRequests, type PullRequestSnapshot } from "@sentinel/ingestion";
import { buildCoverageReport } from "./coverage-builder.js";
import { runDeepInvestigationAgent } from "./deep-investigation-agent.js";
import { applyStoredDispositions } from "./disposition.js";
import { generateDeterministicFindings } from "./deterministic-scanners.js";
import { runExecutableSkills } from "./language-detectors.js";
import { queryOsvAdvisories } from "./osv-advisory.js";
import { buildPullRequestReview, reconcileFindingLifecycle } from "./pull-request-gate.js";
import { buildRankedRecommendations, rankFindings } from "./risk-ranking.js";
import { generateStaticFindings } from "./static-findings.js";
import type { RepositoryStore } from "@sentinel/ingestion";

export interface AnalysisProgressEvent {
  phase: string;
  message: string;
  completed: number;
  total: number;
}

export interface OrchestratorOptions {
  mode: (typeof ANALYSIS_MODE)[keyof typeof ANALYSIS_MODE];
  repository: RepositoryMetadata;
  store: RepositoryStore;
  provider?: AiProviderAdapter;
  apiKey?: string;
  enableAi?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: AnalysisProgressEvent) => void;
  budget?: {
    maxRequests?: number;
    maxTokens?: number;
  };
  githubToken?: string;
  priorMemory?: AuditMemory;
}

export async function runAnalysisOrchestrator(
  options: OrchestratorOptions,
): Promise<AnalysisReport> {
  const reportId = globalThis.crypto.randomUUID();
  let requestsUsed = 0;
  let tokensUsed = 0;
  let partialCompletion = false;
  let partialReason: string | undefined;

  const emit = (phase: string, message: string, completed: number, total: number): void => {
    options.onProgress?.({ phase, message, completed, total });
  };

  emit("inventory", "Indexing repository", 1, 10);

  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  emit("graph", "Extracting architecture graph", 2, 10);
  const graph = extractArchitecture({
    files: options.store.contents,
    commitSha: options.store.index.commitSha,
  });
  const architectureProfile = buildArchitectureProfile(options.store.contents, graph);

  emit("static", "Running rules, secret scans, and dependency advisories", 4, 10);
  const staticFindings = generateStaticFindings({
    contents: options.store.contents,
    graph,
    commitSha: options.store.index.commitSha,
  });
  const scannerFindings = generateDeterministicFindings({
    contents: options.store.contents,
    graph,
    commitSha: options.store.index.commitSha,
  });
  const skillFindings = runExecutableSkills({
    contents: options.store.contents,
    graph,
    commitSha: options.store.index.commitSha,
  });
  const advisoryLookup = await queryOsvAdvisories(options.store.contents, graph, {
    signal: options.signal,
    commitSha: options.store.index.commitSha,
  });
  const observedFlows = extractCallFlows(options.store.contents, options.store.index.commitSha).flows;

  emit("investigate", "Running multi-pass STRIDE deep investigation", 5, 10);
  const emptyAiInvestigation = {
    findings: [] as AnalysisReport["findings"],
    attackPaths: [] as AnalysisReport["attackPaths"],
    threatModelOverview: undefined as string | undefined,
    architectureBrief: undefined as string | undefined,
    agentTrace: [] as AgentTraceEntry[],
    filesSampled: 0,
    totalIndexedFiles: options.store.contents.size,
    aiPassesCompleted: 0,
    memory: undefined,
  };

  const aiInvestigation =
    options.enableAi && options.provider && options.apiKey
      ? await runDeepInvestigationAgent({
          store: options.store,
          graph,
          provider: options.provider,
          apiKey: options.apiKey,
          signal: options.signal,
          budget: options.budget,
          onPhase: (message, completed, total) => {
            emit("investigate", message, completed, total);
          },
          onUsage: (usage) => {
            tokensUsed += usage.totalTokens;
            requestsUsed += 1;
          },
          getUsage: () => ({ requestsUsed, tokensUsed }),
          pullRequests: await loadPullRequests(options),
          priorMemory: options.priorMemory,
          repositoryKey: repositoryKeyFor(options.repository),
        }).catch((error: unknown) => {
          partialCompletion = true;
          partialReason =
            error instanceof Error ? error.message : "AI investigation failed or was unavailable";
          return emptyAiInvestigation;
        })
      : emptyAiInvestigation;

  const aiFindings = aiInvestigation.findings;
  const aiAttackPaths = aiInvestigation.attackPaths;
  const threatModelOverview = aiInvestigation.threatModelOverview;

  if (
    options.budget?.maxRequests !== undefined &&
    requestsUsed >= options.budget.maxRequests
  ) {
    partialCompletion = true;
    partialReason = "Request budget exhausted";
  }
  if (options.budget?.maxTokens !== undefined && tokensUsed >= options.budget.maxTokens) {
    partialCompletion = true;
    partialReason = "Token budget exhausted";
  }

  emit("report", "Assembling report", 9, 10);

  const findings = applyReviewOrdering(
    attachDataFlows(
      dedupeByStableKey([
        ...staticFindings,
        ...scannerFindings,
        ...skillFindings,
        ...advisoryLookup.findings,
        ...aiFindings,
      ]),
      observedFlows,
    ),
    options.priorMemory,
    options.store.index.commitSha,
  );
  const coverage = buildCoverageReport(options.store.index, {
    indexedContentCount: options.store.contents.size,
    truncated: coverageTruncated(options.store),
  });
  coverage.entries = [
    ...coverage.entries,
    ...buildAgentCoverageEntries(
      Boolean(options.enableAi && options.provider && options.apiKey),
      aiInvestigation.agentTrace,
    ),
    ...readingCoverage(aiInvestigation.memory),
    {
      area: "dependency_advisories",
      status: advisoryLookup.status === "complete" ? "complete" : advisoryLookup.status === "failed" ? "partial" : "skipped",
      detail: advisoryLookup.detail,
    },
    {
      area: "deterministic_scanners",
      status: "complete",
      detail: "Secret, authentication, injection, path, deserialization, crypto, container, and workflow patterns were checked for JavaScript, Python, and Go without executing the repository.",
    },
  ];

  const recommendations = buildRankedRecommendations(findings.findings);

  const report: AnalysisReport = {
    schemaVersion: "1.0.0",
    id: reportId,
    title: `${options.repository.name ?? "Repository"} architecture & security review`,
    mode: options.mode,
    repository: options.repository,
    executiveSummary: buildExecutiveSummary(
      findings.findings,
      graph.nodes.length,
      partialCompletion,
      threatModelOverview,
      {
        filesSampled: aiInvestigation.filesSampled,
        totalIndexedFiles: aiInvestigation.totalIndexedFiles,
        aiPassesCompleted: aiInvestigation.aiPassesCompleted,
      },
    ),
    architectureOverview: aiInvestigation.architectureBrief ?? architectureProfile.purpose,
    architectureProfile,
    agentTrace: aiInvestigation.agentTrace,
    memory: attachLifecycleMemory(
      aiInvestigation.memory,
      findings.records,
      findings.findings,
      repositoryKeyFor(options.repository),
      options.store.index.commitSha,
      options.priorMemory,
    ),
    pullRequestReview: buildPullRequestReview({
      findings: findings.findings,
      lifecycle: findings,
      hasPriorMemory: Boolean(options.priorMemory),
    }),
    disclaimer: DEFAULT_DISCLAIMER,
    graph,
    findings: findings.findings,
    attackPaths: aiAttackPaths,
    coverage,
    userCorrections: [],
    recommendations,
    budget: {
      maxTokens: options.budget?.maxTokens,
      maxRequests: options.budget?.maxRequests,
      tokensUsed,
      requestsUsed,
      partialCompletion,
      partialReason,
    },
  };

  emit("complete", "Analysis complete", 10, 10);
  return report;
}

function coverageTruncated(store: RepositoryStore): boolean {
  let nonExcluded = 0;
  for (const file of store.index.files.values()) {
    if (!file.excluded) {
      nonExcluded += 1;
    }
  }
  return nonExcluded > store.contents.size;
}

function dedupeByStableKey(findings: AnalysisReport["findings"]): AnalysisReport["findings"] {
  const map = new Map<string, AnalysisReport["findings"][number]>();
  for (const finding of findings) {
    map.set(finding.stableKey, finding);
  }
  return [...map.values()];
}

function applyReviewOrdering(
  findings: Finding[],
  priorMemory: AuditMemory | undefined,
  commitSha?: string,
): ReturnType<typeof reconcileFindingLifecycle> {
  const withDisposition = applyStoredDispositions(findings, priorMemory);
  const ranked = rankFindings(withDisposition);
  return reconcileFindingLifecycle({ findings: ranked, priorMemory, commitSha });
}

function attachDataFlows(
  findings: Finding[],
  flows: Array<{ path: string; line: number; summary: string; steps: DataFlow["steps"] }>,
): Finding[] {
  const byLocation = new Map<string, (typeof flows)[number]>();
  for (const flow of flows) {
    byLocation.set(`${flow.path}:${flow.line}`, flow);
  }
  return findings.map((finding) => {
    const reference = finding.references[0];
    if (!reference?.startLine) {
      return finding;
    }
    const flow = byLocation.get(`${reference.path}:${reference.startLine}`);
    if (!flow) {
      return finding;
    }
    return {
      ...finding,
      dataFlow: {
        summary: flow.summary,
        steps: flow.steps,
      },
    };
  });
}

function attachLifecycleMemory(
  memory: AuditMemory | undefined,
  records: AuditMemory["findingRecords"],
  findings: Finding[],
  repositoryKey: string,
  commitSha?: string,
  priorMemory?: AuditMemory,
): AuditMemory {
  const updatedAt = new Date().toISOString();
  const priorFindingKeys = findings.map((finding) => finding.stableKey);
  const dispositions = priorMemory?.dispositions ?? memory?.dispositions ?? [];
  if (memory) {
    return {
      ...memory,
      commitSha: commitSha ?? memory.commitSha,
      priorFindingKeys,
      findingRecords: records,
      dispositions,
      updatedAt,
    };
  }
  return {
    repositoryKey,
    commitSha,
    filesRead: [],
    filesPartial: [],
    filesUnread: [],
    openQuestions: [],
    priorFindingKeys,
    findingRecords: records,
    pullRequestsReviewed: [],
    dispositions,
    updatedAt,
  };
}

function buildExecutiveSummary(
  findings: AnalysisReport["findings"],
  nodeCount: number,
  partial: boolean,
  threatModelOverview?: string,
  deepCoverage?: {
    filesSampled: number;
    totalIndexedFiles: number;
    aiPassesCompleted: number;
  },
): string {
  const securityCount = findings.filter((finding) => finding.category === "security").length;
  const architectureCount = findings.filter((finding) => finding.category === "architecture").length;
  const aiCount = findings.filter((finding) => finding.category === "ai_security").length;
  const strideTagged = findings.filter((finding) => finding.strideCategories.length > 0).length;
  const owaspTagged = findings.filter((finding) => (finding.owaspCategories?.length ?? 0) > 0).length;
  const atlasTagged = findings.filter((finding) => (finding.atlasTechniqueIds?.length ?? 0) > 0).length;
  const partialNote = partial
    ? " Analysis completed partially due to budget, provider, or cancellation limits."
    : "";
  const deepNote =
    deepCoverage && deepCoverage.aiPassesCompleted > 0
      ? ` Multi-agent review read ${deepCoverage.filesSampled} prioritized files across ${deepCoverage.totalIndexedFiles} indexed paths (${deepCoverage.aiPassesCompleted} specialist agents completed).`
      : "";
  const findingLabel = findings.length === 1 ? "finding" : "findings";
  const metrics = `Mapped ${nodeCount} architecture components. ${findings.length} ${findingLabel} (${securityCount} security, ${architectureCount} architecture, ${aiCount} AI-security, ${strideTagged} STRIDE-tagged, ${owaspTagged} OWASP-tagged, ${atlasTagged} ATLAS-tagged).${deepNote}${partialNote}`;
  if (threatModelOverview?.trim()) {
    return `${metrics}\n\nThreat model overview:\n${threatModelOverview.trim()}`;
  }
  return `${metrics} This review does not prove security; validate critical items through testing and runtime controls.`;
}

function buildAgentCoverageEntries(
  aiRequested: boolean,
  trace: AgentTraceEntry[],
): CoverageEntry[] {
  if (!aiRequested) {
    return [
      {
        area: "multi_agent_audit",
        status: "skipped",
        detail: "AI multi-agent audit was not run.",
      },
    ];
  }
  return AUDIT_AGENT_ORDER.map((agentId) => {
    const matches = trace.filter((item) => item.agentId === agentId);
    const entry = matches[matches.length - 1];
    const sawCompleted = matches.some((item) => item.status === AGENT_RUN_STATUS.COMPLETED);
    const sawSkipped = matches.some((item) => item.status === AGENT_RUN_STATUS.SKIPPED);
    const sawFailed = matches.some((item) => item.status === AGENT_RUN_STATUS.FAILED);
    const status = sawFailed || (sawCompleted && sawSkipped)
      ? "partial"
      : sawCompleted
        ? "complete"
        : "skipped";
    return {
      area: `${agentId}_agent`,
      status,
      detail: entry?.detail,
    };
  });
}

function readingCoverage(memory: AuditMemory | undefined): CoverageEntry[] {
  if (!memory) {
    return [];
  }
  const indexed = memory.filesRead.length + memory.filesUnread.length;
  if (indexed === 0) {
    return [];
  }
  return [
    {
      area: "repository_reading",
      status: memory.filesUnread.length === 0 ? "complete" : "partial",
      detail: `Read ${memory.filesRead.length} of ${indexed} indexed files. ${memory.filesPartial.length} files were longer than the full-read window. ${memory.pullRequestsReviewed.length} open pull requests reviewed.`,
      fileCount: memory.filesRead.length,
    },
  ];
}

function repositoryKeyFor(repository: RepositoryMetadata): string {
  if (repository.owner && repository.name) {
    return `${repository.owner}/${repository.name}`;
  }
  return repository.url ?? repository.name ?? "repository";
}

async function loadPullRequests(options: OrchestratorOptions): Promise<PullRequestSnapshot[]> {
  if (!options.repository.owner || !options.repository.name) {
    return [];
  }
  try {
    return await fetchOpenPullRequests(
      {
        owner: options.repository.owner,
        name: options.repository.name,
        ref: options.repository.ref,
      },
      { token: options.githubToken, signal: options.signal },
    );
  } catch {
    return [];
  }
}
