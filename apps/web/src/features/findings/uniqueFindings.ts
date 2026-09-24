import type { Finding } from "@sentinel/schema";

export function uniqueFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding) => !finding.duplicateOfStableKey);
}

export function citedFileCount(finding: Finding): number {
  const paths = new Set(finding.references.map((reference) => reference.path));
  if (paths.size > 0) {
    return paths.size;
  }
  return finding.affectedAssetSummary ? 1 : 0;
}
