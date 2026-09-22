import { z } from "zod";
import { PROVENANCE_KIND } from "./constants.js";

export const FileReferenceSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  commitSha: z.string().optional(),
  excerpt: z.string().max(8000).optional(),
});

export type FileReference = z.infer<typeof FileReferenceSchema>;

export const ProvenanceSchema = z.object({
  kind: z.enum([
    PROVENANCE_KIND.OBSERVED,
    PROVENANCE_KIND.INFERRED,
    PROVENANCE_KIND.USER_DECLARED,
    PROVENANCE_KIND.UNKNOWN,
  ]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(4000).optional(),
  references: z.array(FileReferenceSchema).default([]),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  summary: z.string().max(2000),
  provenance: ProvenanceSchema,
  references: z.array(FileReferenceSchema).default([]),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
