import { z } from "zod";

export const CoverageEntrySchema = z.object({
  area: z.string().min(1),
  status: z.enum(["complete", "partial", "skipped", "unsupported"]),
  detail: z.string().max(4000).optional(),
  fileCount: z.number().int().nonnegative().optional(),
});

export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

export const CoverageReportSchema = z.object({
  commitSha: z.string().optional(),
  totalFilesIndexed: z.number().int().nonnegative(),
  excludedFiles: z.number().int().nonnegative(),
  truncated: z.boolean(),
  truncationReason: z.string().max(2000).optional(),
  languages: z.record(z.string(), z.number().int().nonnegative()),
  unsupportedLanguages: z.array(z.string()).default([]),
  unresolvedDependencies: z.array(z.string()).default([]),
  submodulesDetected: z.array(z.string()).default([]),
  missingConfiguration: z.array(z.string()).default([]),
  entries: z.array(CoverageEntrySchema).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
});

export type CoverageReport = z.infer<typeof CoverageReportSchema>;
