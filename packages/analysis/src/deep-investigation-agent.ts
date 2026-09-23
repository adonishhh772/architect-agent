import type { AiProviderAdapter } from "@sentinel/providers";
import type { AgentTraceEntry, AnalysisReport, AuditMemory } from "@sentinel/schema";
import type { PullRequestSnapshot, RepositoryStore } from "@sentinel/ingestion";
import { runMultiAgentAudit } from "./audit-graph.js";
import type { InvestigationToolContext } from "./investigation-tools.js";

export interface DeepInvestigationAgentOptions {
  store: RepositoryStore;
  graph: AnalysisReport["graph"];
  provider: AiProviderAdapter;
  apiKey: string;
  signal?: AbortSignal;
  budget?: { maxRequests?: number; maxTokens?: number };
  onPhase?: (message: string, completed: number, total: number) => void;
  onUsage?: (usage: { totalTokens: number }) => void;
  getUsage?: () => { requestsUsed: number; tokensUsed: number };
  pullRequests?: PullRequestSnapshot[];
  priorMemory?: AuditMemory;
  repositoryKey?: string;
}

export interface DeepInvestigationAgentResult {
  findings: AnalysisReport["findings"];
  attackPaths: AnalysisReport["attackPaths"];
  threatModelOverview?: string;
  architectureBrief?: string;
  agentTrace: AgentTraceEntry[];
  filesSampled: number;
  totalIndexedFiles: number;
  aiPassesCompleted: number;
  memory?: AuditMemory;
}

export async function runDeepInvestigationAgent(
  options: DeepInvestigationAgentOptions,
): Promise<DeepInvestigationAgentResult> {
  const context: InvestigationToolContext = {
    contents: options.store.contents,
    graph: options.graph,
  };
  return runMultiAgentAudit({
    context,
    provider: options.provider,
    apiKey: options.apiKey,
    signal: options.signal,
    budget: options.budget,
    commitSha: options.store.index.commitSha,
    onPhase: options.onPhase,
    onUsage: options.onUsage,
    getUsage: options.getUsage,
    pullRequests: options.pullRequests,
    priorMemory: options.priorMemory,
    repositoryKey: options.repositoryKey,
  });
}
