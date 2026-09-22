import { extractArchitectureFromTypeScript } from "@sentinel/graph";
import type { AiProviderAdapter } from "@sentinel/providers";
import {
  ANALYSIS_MODE,
  DEFAULT_DISCLAIMER,
  type AnalysisReport,
  type RepositoryMetadata,
} from "@sentinel/schema";
import { buildCoverageReport } from "./coverage-builder.js";
import { runDeepInvestigationAgent } from "./deep-investigation-agent.js";
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
  const graph = extractArchitectureFromTypeScript({
    files: options.store.contents,
    commitSha: options.store.index.commitSha,
  });

  emit("static", "Running static architecture and security rules", 4, 10);
  const staticFindings = generateStaticFindings({
    contents: options.store.contents,
    graph,
    commitSha: options.store.index.commitSha,
  });

  emit("investigate", "Running multi-pass STRIDE deep investigation", 5, 10);
  const emptyAiInvestigation = {
    findings: [] as AnalysisReport["findings"],
    attackPaths: [] as AnalysisReport["attackPaths"],
    threatModelOverview: undefined as string | undefined,
    filesSampled: 0,
    totalIndexedFiles: options.store.contents.size,
    aiPassesCompleted: 0,
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

  const findings = dedupeByStableKey([...staticFindings, ...aiFindings]);
  const coverage = buildCoverageReport(options.store.index, {
    indexedContentCount: options.store.contents.size,
    truncated: coverageTruncated(options.store),
  });

  const recommendations = buildRecommendations(findings);

  const report: AnalysisReport = {
    schemaVersion: "1.0.0",
    id: reportId,
    title: `${options.repository.name ?? "Repository"} architecture & security review`,
    mode: options.mode,
    repository: options.repository,
    executiveSummary: buildExecutiveSummary(
      findings,
      graph.nodes.length,
      partialCompletion,
      threatModelOverview,
      {
        filesSampled: aiInvestigation.filesSampled,
        totalIndexedFiles: aiInvestigation.totalIndexedFiles,
        aiPassesCompleted: aiInvestigation.aiPassesCompleted,
      },
    ),
    disclaimer: DEFAULT_DISCLAIMER,
    graph,
    findings,
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

function buildRecommendations(findings: AnalysisReport["findings"]): AnalysisReport["recommendations"] {
  return findings.slice(0, 8).map((finding, index) => ({
    id: `rec-${finding.stableKey}`,
    priority: Math.min(5, index + 1),
    title: finding.title,
    description: finding.mitigation,
    relatedFindingIds: [finding.id],
    rationale: finding.severityRationale,
  }));
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
  const partialNote = partial
    ? " Analysis completed partially due to budget, provider, or cancellation limits."
    : "";
  const deepNote =
    deepCoverage && deepCoverage.aiPassesCompleted > 0
      ? ` Deep review sampled ${deepCoverage.filesSampled} prioritized files across ${deepCoverage.totalIndexedFiles} indexed paths (${deepCoverage.aiPassesCompleted} AI passes).`
      : "";
  const metrics = `Mapped ${nodeCount} architecture components. ${findings.length} findings (${securityCount} security, ${architectureCount} architecture, ${aiCount} AI-security, ${strideTagged} STRIDE-tagged).${deepNote}${partialNote}`;
  if (threatModelOverview?.trim()) {
    return `${metrics}\n\nThreat model overview:\n${threatModelOverview.trim()}`;
  }
  return `${metrics} This review does not prove security; validate critical items through testing and runtime controls.`;
}
