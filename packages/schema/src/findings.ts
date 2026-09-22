import { z } from "zod";
import {
  FINDING_CATEGORY,
  FINDING_STATUS,
  STRIDE_CATEGORY,
} from "./constants.js";
import { EvidenceItemSchema, FileReferenceSchema } from "./evidence.js";

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
