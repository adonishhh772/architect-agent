import { FINDING_STATUS, type AnalysisReport, type Finding } from "@sentinel/schema";
import { SCANNER_RULE } from "./deterministic-scanners.js";
import { isSuppressedDisposition } from "./disposition.js";
import { collectFindingCitations, summarizeFindingCitations } from "./finding-citations.js";
import { DETECTOR_RULE } from "./language-detectors.js";

const IMPACT = {
  CODE_EXECUTION: 5,
  CREDENTIAL: 5,
  INJECTION: 4,
  ADVISORY: 4,
  AI: 4,
  DEFAULT: 3,
  WEAK_EVIDENCE: 2,
} as const;

const LIKELIHOOD = {
  CODE_SUPPORTED: 4,
  PLAUSIBLE: 3,
  ARCHITECTURE: 2,
  INSUFFICIENT: 1,
  DATA_FLOW_BONUS: 1,
  MAX: 5,
} as const;

const STATIC_WEAKNESS_RULES = [
  "secret-default",
  "secret-log",
  "unbounded-loop",
  "ai-tool-auth",
  "env-file",
  "published-port",
  "missing-auth-layer",
  "eval",
  "xss",
] as const;

const WEAKNESS_RULES = [...Object.values(SCANNER_RULE), ...Object.values(DETECTOR_RULE), ...STATIC_WEAKNESS_RULES].sort(
  (left, right) => right.length - left.length,
);

export function vulnerabilityGroupKey(finding: Finding): string {
  const rule = weaknessRuleId(finding.stableKey);
  const cweIds = [...(finding.cweIds ?? [])].sort();
  if (rule && cweIds.length > 0) {
    return `rule:${rule}|cwe:${cweIds.join(",")}`;
  }
  if (rule) {
    return `rule:${rule}`;
  }
  return `title:${finding.title.trim().toLowerCase()}`;
}

function weaknessRuleId(stableKey: string): string | undefined {
  return WEAKNESS_RULES.find((rule) => stableKey === rule || stableKey.startsWith(`${rule}-`));
}

export function rankFindings(findings: Finding[]): Finding[] {
  const scored = findings.map(scoreFinding);
  const groups = new Map<string, Finding[]>();
  for (const finding of scored) {
    const key = vulnerabilityGroupKey(finding);
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }

  const flattened: Finding[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareRisk);
    const primary = sorted[0];
    if (!primary) {
      continue;
    }
    const duplicates = sorted.slice(1);
    flattened.push({
      ...primary,
      relatedFindingIds: duplicates.map((finding) => finding.id),
      references: collectFindingCitations([primary, ...duplicates]),
    });
    for (const duplicate of duplicates) {
      flattened.push({
        ...duplicate,
        duplicateOfStableKey: primary.stableKey,
        remediationRank: undefined,
      });
    }
  }

  flattened.sort(compareRisk);
  let rank = 1;
  return flattened.map((finding) => {
    if (finding.duplicateOfStableKey) {
      return finding;
    }
    const ranked: Finding = { ...finding, remediationRank: rank };
    rank += 1;
    return ranked;
  });
}

export function buildRankedRecommendations(findings: Finding[]): AnalysisReport["recommendations"] {
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  return findings
    .filter((finding) => !finding.duplicateOfStableKey && !isSuppressedDisposition(finding.disposition))
    .slice()
    .sort((left, right) => (left.remediationRank ?? Number.MAX_SAFE_INTEGER) - (right.remediationRank ?? Number.MAX_SAFE_INTEGER))
    .map((finding) => {
      const related = finding.relatedFindingIds
        .map((findingId) => findingById.get(findingId))
        .filter((relatedFinding): relatedFinding is Finding => relatedFinding !== undefined);
      const citationSummary = summarizeFindingCitations([finding, ...related]);
      return {
        id: `rec-${finding.stableKey}`,
        priority: priorityForScore(finding.riskScore ?? 1),
        title: finding.title,
        description: finding.mitigation,
        relatedFindingIds: [finding.id, ...finding.relatedFindingIds],
        citations: citationSummary.citations,
        omittedFileCount: citationSummary.omittedFileCount,
        rationale: `Impact ${finding.impact ?? 0}, likelihood ${finding.likelihood ?? 0}, risk ${finding.riskScore ?? 0}. ${finding.severityRationale}`,
      };
    });
}

function scoreFinding(finding: Finding): Finding {
  const impact = impactFor(finding);
  let likelihood = likelihoodFor(finding);
  if ((finding.dataFlow?.steps.length ?? 0) >= 2) {
    likelihood = Math.min(LIKELIHOOD.MAX, likelihood + LIKELIHOOD.DATA_FLOW_BONUS);
  }
  return {
    ...finding,
    impact,
    likelihood,
    riskScore: impact * likelihood,
  };
}

function impactFor(finding: Finding): number {
  const key = finding.stableKey;
  if (
    key.startsWith("eval-") ||
    key.startsWith("command-injection") ||
    key.startsWith("command-execution") ||
    key.startsWith("deserialization") ||
    key.startsWith("path-traversal") ||
    key.startsWith("workflow-") ||
    key.startsWith("supply-chain")
  ) {
    return IMPACT.CODE_EXECUTION;
  }
  if (key.startsWith("secret-") || key.startsWith("env-file")) {
    return IMPACT.CREDENTIAL;
  }
  if (key.startsWith("advisory-")) {
    return IMPACT.ADVISORY;
  }
  if (
    key.startsWith("sql-injection") ||
    key.startsWith("sql-interpolation") ||
    key.startsWith("xss-") ||
    key.startsWith("ssrf-") ||
    key.startsWith("missing-auth") ||
    key.startsWith("route-auth") ||
    key.startsWith("published-port") ||
    key.startsWith("weak-crypto") ||
    key.startsWith("jwt-") ||
    key.startsWith("insecure-cookie") ||
    key.startsWith("dockerfile-")
  ) {
    return IMPACT.INJECTION;
  }
  if (finding.category === "ai_security") {
    return IMPACT.AI;
  }
  if (finding.status === FINDING_STATUS.INSUFFICIENT_EVIDENCE) {
    return IMPACT.WEAK_EVIDENCE;
  }
  return IMPACT.DEFAULT;
}

function likelihoodFor(finding: Finding): number {
  if (finding.status === FINDING_STATUS.CODE_SUPPORTED) {
    return LIKELIHOOD.CODE_SUPPORTED;
  }
  if (finding.status === FINDING_STATUS.ARCHITECTURE_CONCERN) {
    return LIKELIHOOD.ARCHITECTURE;
  }
  if (finding.status === FINDING_STATUS.INSUFFICIENT_EVIDENCE) {
    return LIKELIHOOD.INSUFFICIENT;
  }
  return LIKELIHOOD.PLAUSIBLE;
}

function priorityForScore(score: number): number {
  if (score >= 20) {
    return 1;
  }
  if (score >= 15) {
    return 2;
  }
  if (score >= 10) {
    return 3;
  }
  if (score >= 5) {
    return 4;
  }
  return 5;
}

function compareRisk(left: Finding, right: Finding): number {
  const scoreDelta = (right.riskScore ?? 0) - (left.riskScore ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return left.stableKey.localeCompare(right.stableKey);
}
