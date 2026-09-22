import type { FileReference } from "./evidence.js";
import type { Finding } from "./findings.js";
import type { RepositoryFileIndex } from "./repository-index.js";

export interface EvidenceValidationResult {
  valid: boolean;
  invalidReferences: Array<{ findingId: string; path: string; reason: string }>;
}

export function validateFileReferenceAgainstIndex(
  ref: FileReference,
  index: RepositoryFileIndex,
): { valid: boolean; reason?: string } {
  const file = index.files.get(ref.path);
  if (!file) {
    return { valid: false, reason: "file_not_in_index" };
  }
  if (ref.startLine !== undefined && ref.startLine > file.lineCount) {
    return { valid: false, reason: "start_line_out_of_range" };
  }
  if (ref.endLine !== undefined && ref.endLine > file.lineCount) {
    return { valid: false, reason: "end_line_out_of_range" };
  }
  if (
    ref.startLine !== undefined &&
    ref.endLine !== undefined &&
    ref.endLine < ref.startLine
  ) {
    return { valid: false, reason: "invalid_line_range" };
  }
  return { valid: true };
}

export function validateFindingsEvidence(
  findings: Finding[],
  index: RepositoryFileIndex,
): EvidenceValidationResult {
  const invalidReferences: EvidenceValidationResult["invalidReferences"] = [];

  for (const finding of findings) {
    for (const ref of finding.references) {
      const result = validateFileReferenceAgainstIndex(ref, index);
      if (!result.valid) {
        invalidReferences.push({
          findingId: finding.id,
          path: ref.path,
          reason: result.reason ?? "invalid",
        });
      }
    }
  }

  return {
    valid: invalidReferences.length === 0,
    invalidReferences,
  };
}
