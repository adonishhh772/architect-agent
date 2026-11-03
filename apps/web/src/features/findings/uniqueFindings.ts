import type { Finding } from "@sentinel/schema";

export function uniqueFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding) => !finding.duplicateOfStableKey);
}

export function collapseFindingsByTitle(findings: Finding[]): Finding[] {
  const grouped = new Map<string, Finding>();
  for (const finding of uniqueFindings(findings)) {
    const titleKey = finding.title.trim().toLowerCase();
    const existing = grouped.get(titleKey);
    if (!existing) {
      grouped.set(titleKey, { ...finding, references: [...finding.references] });
      continue;
    }
    grouped.set(titleKey, mergeFindingCopies(existing, finding));
  }
  return [...grouped.values()];
}

function mergeFindingCopies(existing: Finding, incoming: Finding): Finding {
  const preferred = (incoming.riskScore ?? 0) > (existing.riskScore ?? 0) ? incoming : existing;
  const references = [...existing.references];
  for (const reference of incoming.references) {
    const alreadyCited = references.some(
      (item) => item.path === reference.path && item.startLine === reference.startLine,
    );
    if (!alreadyCited) {
      references.push(reference);
    }
  }
  return { ...preferred, references };
}

export function citedFileCount(finding: Finding): number {
  const paths = new Set(finding.references.map((reference) => reference.path));
  if (paths.size > 0) {
    return paths.size;
  }
  return finding.affectedAssetSummary ? 1 : 0;
}
