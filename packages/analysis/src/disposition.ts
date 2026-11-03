import {
  FINDING_DISPOSITION,
  type AuditMemory,
  type Finding,
  type FindingDispositionRecord,
} from "@sentinel/schema";

const DISPOSITION_LIMIT = 400;

export function applyStoredDispositions(findings: Finding[], memory: AuditMemory | undefined): Finding[] {
  const stored = new Map((memory?.dispositions ?? []).map((record) => [record.stableKey, record.disposition]));
  if (stored.size === 0) {
    return findings;
  }
  return findings.map((finding) => {
    const disposition = stored.get(finding.stableKey);
    if (!disposition) {
      return finding;
    }
    return { ...finding, disposition };
  });
}

export function rememberDisposition(
  memory: AuditMemory,
  stableKey: string,
  disposition: FindingDispositionRecord["disposition"],
  note?: string,
): AuditMemory {
  const next: FindingDispositionRecord = note ? { stableKey, disposition, note } : { stableKey, disposition };
  const kept = memory.dispositions.filter((record) => record.stableKey !== stableKey);
  return {
    ...memory,
    dispositions: [...kept, next].slice(0, DISPOSITION_LIMIT),
    updatedAt: new Date().toISOString(),
  };
}

export function isSuppressedDisposition(disposition: Finding["disposition"]): boolean {
  return disposition === FINDING_DISPOSITION.FALSE_POSITIVE || disposition === FINDING_DISPOSITION.ACCEPTED_RISK;
}

export function findingsBlockingGate(findings: Finding[], minimumRisk: number): Finding[] {
  return findings.filter((finding) => {
    if (finding.duplicateOfStableKey) {
      return false;
    }
    if (isSuppressedDisposition(finding.disposition)) {
      return false;
    }
    return (finding.riskScore ?? 0) >= minimumRisk;
  });
}
