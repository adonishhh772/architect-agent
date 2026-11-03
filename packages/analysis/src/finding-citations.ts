import type { FileReference, Finding } from "@sentinel/schema";

const CITATION_FILE_LIMIT = 5000;

export interface CitationSummary {
  citations: FileReference[];
  omittedFileCount: number;
}

export function collectFindingCitations(findings: Finding[]): FileReference[] {
  return gatherCitations(findingsByRisk(findings));
}

export function summarizeFindingCitations(findings: Finding[]): CitationSummary {
  const pending = gatherCitations(findingsByRisk(findings));
  const fileOrder: string[] = [];
  const seenFiles = new Set<string>();
  for (const reference of pending) {
    if (seenFiles.has(reference.path)) {
      continue;
    }
    seenFiles.add(reference.path);
    fileOrder.push(reference.path);
  }
  const includedFiles = new Set(fileOrder.slice(0, CITATION_FILE_LIMIT));
  const citations = pending.filter((reference) => includedFiles.has(reference.path));
  const citedFiles = new Set(citations.map((reference) => reference.path));
  return {
    citations,
    omittedFileCount: fileOrder.filter((path) => !citedFiles.has(path)).length,
  };
}

function findingsByRisk(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const riskDelta = (right.riskScore ?? 0) - (left.riskScore ?? 0);
    if (riskDelta !== 0) {
      return riskDelta;
    }
    return left.stableKey.localeCompare(right.stableKey);
  });
}

function gatherCitations(findings: Finding[]): FileReference[] {
  const seen = new Set<string>();
  const citations: FileReference[] = [];
  for (const finding of findings) {
    for (const reference of referencesForFinding(finding)) {
      const key = citationKey(reference);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      citations.push(citationFromReference(reference));
    }
  }
  return citations;
}

export function citationOmissionNote(omittedFileCount: number): string | undefined {
  if (omittedFileCount <= 0) {
    return undefined;
  }
  if (omittedFileCount === 1) {
    return "1 lower-risk file also contains this weakness and is not listed.";
  }
  return `${omittedFileCount} lower-risk files also contain this weakness and are not listed.`;
}

export function findingsSharingVulnerability(finding: Finding, findings: Finding[]): Finding[] {
  const relatedIds = new Set(finding.relatedFindingIds);
  const grouped = [finding];
  for (const candidate of findings) {
    if (candidate.id === finding.id) {
      continue;
    }
    if (relatedIds.has(candidate.id) || candidate.duplicateOfStableKey === finding.stableKey) {
      grouped.push(candidate);
    }
  }
  return grouped;
}

function referencesForFinding(finding: Finding): FileReference[] {
  if (finding.references.length > 0) {
    return finding.references;
  }
  if (!finding.affectedAssetSummary) {
    return [];
  }
  return [{ path: finding.affectedAssetSummary }];
}

function citationKey(reference: FileReference): string {
  return `${reference.path}:${reference.startLine ?? ""}:${reference.endLine ?? ""}`;
}

function citationFromReference(reference: FileReference): FileReference {
  return {
    path: reference.path,
    startLine: reference.startLine,
    endLine: reference.endLine,
    commitSha: reference.commitSha,
  };
}
