import { z } from "zod";
import {
  ATLAS_TECHNIQUE_LIST,
  DATA_FLOW_ROLE_LIST,
  FINDING_CATEGORY,
  FINDING_LIFECYCLE_LIST,
  FINDING_STATUS,
  OWASP_CATEGORY_LIST,
  RISK_DOMAIN_LIST,
  STRIDE_CATEGORY,
} from "./constants.js";
import { EvidenceItemSchema, FileReferenceSchema } from "./evidence.js";

export const DataFlowStepSchema = z.object({
  role: z.enum(DATA_FLOW_ROLE_LIST),
  path: z.string().min(1).max(1000),
  line: z.number().int().positive().optional(),
  label: z.string().min(1).max(300),
});

export const DataFlowSchema = z.object({
  summary: z.string().min(1).max(2000),
  steps: z.array(DataFlowStepSchema).min(1).max(12),
});

export type DataFlow = z.infer<typeof DataFlowSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  stableKey: z.string().min(1),
  title: z.string().min(1).max(500),
  category: z.enum([
    FINDING_CATEGORY.ARCHITECTURE,
    FINDING_CATEGORY.SECURITY,
    FINDING_CATEGORY.AI_SECURITY,
  ]),
  strideCategories: z
    .array(
      z.enum([
        STRIDE_CATEGORY.SPOOFING,
        STRIDE_CATEGORY.TAMPERING,
        STRIDE_CATEGORY.REPUDIATION,
        STRIDE_CATEGORY.INFORMATION_DISCLOSURE,
        STRIDE_CATEGORY.DENIAL_OF_SERVICE,
        STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE,
      ]),
    )
    .default([]),
  owaspCategories: z.array(z.enum(OWASP_CATEGORY_LIST)).optional(),
  atlasTechniqueIds: z.array(z.enum(ATLAS_TECHNIQUE_LIST)).optional(),
  riskDomains: z.array(z.enum(RISK_DOMAIN_LIST)).optional(),
  status: z.enum([
    FINDING_STATUS.CODE_SUPPORTED,
    FINDING_STATUS.PLAUSIBLE_THREAT,
    FINDING_STATUS.ARCHITECTURE_CONCERN,
    FINDING_STATUS.INSUFFICIENT_EVIDENCE,
  ]),
  affectedNodeIds: z.array(z.string()).default([]),
  affectedAssetSummary: z.string().max(2000),
  commitSha: z.string().optional(),
  references: z.array(FileReferenceSchema).default([]),
  evidence: z.array(EvidenceItemSchema).default([]),
  scenario: z.string().max(8000),
  preconditions: z.array(z.string()).default([]),
  trustBoundaryCrossings: z.array(z.string()).default([]),
  existingControls: z.array(z.string()).default([]),
  counterevidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  impact: z.number().int().min(1).max(5).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  riskScore: z.number().int().min(1).max(25).optional(),
  remediationRank: z.number().int().positive().optional(),
  lifecycle: z.enum(FINDING_LIFECYCLE_LIST).optional(),
  duplicateOfStableKey: z.string().max(300).optional(),
  dataFlow: DataFlowSchema.optional(),
  severityRationale: z.string().max(4000),
  likelihoodRationale: z.string().max(4000),
  assumptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  mitigation: z.string().max(8000),
  architecturalTradeoffs: z.string().max(4000).optional(),
  suggestedVerificationTest: z.string().max(4000).optional(),
  relatedFindingIds: z.array(z.string()).default([]),
  attackPathIds: z.array(z.string()).default([]),
});

export type Finding = z.infer<typeof FindingSchema>;

export const AttackPathSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(500),
  stepFindingIds: z.array(z.string()).min(1),
  prerequisiteFindingIds: z.array(z.string()).default([]),
  unsupportedLinks: z.array(z.string()).default([]),
  description: z.string().max(8000),
});

export type AttackPath = z.infer<typeof AttackPathSchema>;
