import { z } from "zod";
import { AGENT_RUN_STATUS, ANALYSIS_MODE, REPORT_SCHEMA_VERSION } from "./constants.js";
import { ArchitectureGraphSchema } from "./graph.js";
import { AttackPathSchema, FindingSchema } from "./findings.js";
import { CoverageReportSchema } from "./coverage.js";
import { UserCorrectionSchema } from "./corrections.js";
import { AuditMemorySchema } from "./memory.js";

export const PullRequestReviewSchema = z.object({
  commentBody: z.string().max(16000),
  newFindingKeys: z.array(z.string().max(300)).default([]),
  fixedFindingKeys: z.array(z.string().max(300)).default([]),
  regressedFindingKeys: z.array(z.string().max(300)).default([]),
});

export type PullRequestReview = z.infer<typeof PullRequestReviewSchema>;

export const AgentTraceEntrySchema = z.object({
  agentId: z.string().min(1),
  status: z.enum([
    AGENT_RUN_STATUS.COMPLETED,
    AGENT_RUN_STATUS.SKIPPED,
    AGENT_RUN_STATUS.FAILED,
  ]),
  detail: z.string().max(2000),
  toolCallCount: z.number().int().nonnegative(),
});

export type AgentTraceEntry = z.infer<typeof AgentTraceEntrySchema>;

export const RepositoryMetadataSchema = z.object({
  sourceType: z.enum(["github", "zip", "import"]),
  url: z.string().url().optional(),
  owner: z.string().optional(),
  name: z.string().optional(),
  commitSha: z.string().optional(),
  ref: z.string().optional(),
  defaultBranch: z.string().optional(),
  analyzedAt: z.string().datetime(),
});

export type RepositoryMetadata = z.infer<typeof RepositoryMetadataSchema>;

export const AnalysisBudgetSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxRequests: z.number().int().positive().optional(),
  maxFiles: z.number().int().positive().optional(),
  tokensUsed: z.number().int().nonnegative().default(0),
  requestsUsed: z.number().int().nonnegative().default(0),
  partialCompletion: z.boolean().default(false),
  partialReason: z.string().max(4000).optional(),
});

export type AnalysisBudget = z.infer<typeof AnalysisBudgetSchema>;

export const AnalysisReportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  mode: z.enum([
    ANALYSIS_MODE.BROWSER,
    ANALYSIS_MODE.DEEP_RUNNER,
    ANALYSIS_MODE.IMPORTED,
  ]),
  repository: RepositoryMetadataSchema,
  executiveSummary: z.string().max(16000),
  architectureOverview: z.string().max(16000).optional(),
  agentTrace: z.array(AgentTraceEntrySchema).default([]),
  disclaimer: z.string().max(4000),
  graph: ArchitectureGraphSchema,
  findings: z.array(FindingSchema),
  attackPaths: z.array(AttackPathSchema).default([]),
  coverage: CoverageReportSchema,
  userCorrections: z.array(UserCorrectionSchema).default([]),
  recommendations: z.array(
    z.object({
      id: z.string().min(1),
      priority: z.number().int().min(1).max(5),
      title: z.string().max(500),
      description: z.string().max(8000),
      relatedFindingIds: z.array(z.string()).default([]),
      rationale: z.string().max(4000),
    }),
  ),
  budget: AnalysisBudgetSchema,
  memory: AuditMemorySchema.optional(),
  pullRequestReview: PullRequestReviewSchema.optional(),
  checkpointId: z.string().optional(),
});

export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

export const DEFAULT_DISCLAIMER =
  "This report is based on static analysis and optional AI-assisted review of repository contents at a pinned commit. It does not prove the system is secure, does not replace penetration testing or runtime validation, and may miss issues in unindexed files, private infrastructure, or behavior not visible in source.";
