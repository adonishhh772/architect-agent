import { z } from "zod";
import { FINDING_LIFECYCLE_LIST } from "./constants.js";

export const FindingRecordSchema = z.object({
  stableKey: z.string().min(1).max(300),
  lifecycle: z.enum(FINDING_LIFECYCLE_LIST),
  commitSha: z.string().max(200).optional(),
});

export type FindingRecord = z.infer<typeof FindingRecordSchema>;

export const AuditMemoryPullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(500),
  state: z.string().max(40),
  filenames: z.array(z.string().max(1000)).max(40).default([]),
});

export type AuditMemoryPullRequest = z.infer<typeof AuditMemoryPullRequestSchema>;

export const AuditMemorySchema = z.object({
  repositoryKey: z.string().min(1).max(500),
  commitSha: z.string().max(200).optional(),
  architectureBrief: z.string().max(16000).optional(),
  filesRead: z.array(z.string().max(1000)).default([]),
  filesPartial: z.array(z.string().max(1000)).default([]),
  filesUnread: z.array(z.string().max(1000)).default([]),
  openQuestions: z.array(z.string().max(2000)).max(40).default([]),
  priorFindingKeys: z.array(z.string().max(300)).default([]),
  findingRecords: z.array(FindingRecordSchema).max(400).default([]),
  pullRequestsReviewed: z.array(AuditMemoryPullRequestSchema).default([]),
  updatedAt: z.string().datetime(),
});

export type AuditMemory = z.infer<typeof AuditMemorySchema>;
