import { z } from "zod";
import { GraphNodeSchema, GraphEdgeSchema } from "./graph.js";

export const ReviewStateSchema = z.object({
  owner: z.string().max(200).default(""),
  dueDate: z.string().max(10).default(""),
  notes: z.string().max(8000).default(""),
  decision: z.enum(["unreviewed", "confirmed", "false_positive", "accepted_risk"]).default("unreviewed"),
  verification: z.enum(["not_verified", "test_passed", "test_failed"]).default("not_verified"),
  verificationEvidence: z.string().max(8000).default(""),
  verifiedCommit: z.string().max(64).default(""),
  updatedAt: z.string().datetime(),
});
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const FlowAnnotationSchema = z.object({
  label: z.string().max(500).default(""),
  dataClass: z.enum(["unknown", "public", "internal", "confidential", "restricted"]).default("unknown"),
  transport: z.string().max(200).default("unknown"),
  authentication: z.string().max(500).default("unknown"),
  authorizationControl: z.string().max(500).default("unknown"),
  boundary: z.string().max(500).default("unknown"),
  notes: z.string().max(4000).default(""),
  hidden: z.boolean().default(false),
  updatedAt: z.string().datetime(),
});
export type FlowAnnotation = z.infer<typeof FlowAnnotationSchema>;

export const ControlAssessmentSchema = z.object({
  status: z.enum(["not_assessed", "met", "gap", "not_applicable"]).default("not_assessed"),
  evidence: z.string().max(8000).default(""),
  reviewer: z.string().max(200).default(""),
  updatedAt: z.string().datetime(),
});
export const AnalystStateSchema = z.object({
  version: z.literal(1).default(1),
  positions: z.record(z.string().max(1000), z.object({x:z.number().finite().min(0).max(20000),y:z.number().finite().min(0).max(20000)})).default({}),
  declaredNodes: z.array(GraphNodeSchema).max(200).default([]),
  declaredFlows: z.array(GraphEdgeSchema).max(500).default([]),
  zones: z.record(z.string().max(1000), z.string().max(200)).default({}),
  reviews: z.record(z.string().max(1000), ReviewStateSchema).default({}),
  flows: z.record(z.string().max(1000), FlowAnnotationSchema).default({}),
  controls: z.record(z.string().max(200), ControlAssessmentSchema).default({}),
  events: z.array(z.object({
    at: z.string().datetime(), action: z.string().max(100), target: z.string().max(1000), detail: z.string().max(2000),
  })).max(2000).default([]),
  scannerRuns: z.array(z.object({
    id: z.string().max(200), tool: z.string().max(300), version: z.string().max(100),
    commit: z.string().max(64), importedAt: z.string().datetime(),
    resultCount: z.number().int().nonnegative(), skippedCount: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative().optional(), omittedFiles: z.number().int().nonnegative().optional(),
    status: z.enum(["imported", "failed", "partial"]), detail: z.string().max(2000),
  })).max(200).default([]),
});
export type AnalystState = z.infer<typeof AnalystStateSchema>;
