import type { PersistedReportRecord } from "../persistence/indexedDbStore";

export const HIGH_FINDING_RISK = 16;

export interface WorkspaceRunSummary {
  title: string;
  repositoryName: string;
  findingCount: number;
  recommendationCount: number;
  highestRisk: number | null;
  analyzedAt: string;
}

export interface IndexedStoreMatchInput {
  sourceLabel: string;
  repoUrl: string;
  commitSha: string | undefined;
  reportRepositoryName: string | undefined;
  reportRepositoryUrl: string | undefined;
  reportCommitSha: string | undefined;
}

export function summarizeWorkspaceRun(record: PersistedReportRecord): WorkspaceRunSummary {
  const findings = record.report.findings ?? [];
  const recommendations = record.report.recommendations ?? [];
  let highestRisk: number | null = null;
  for (const finding of findings) {
    const riskScore = finding.riskScore;
    if (riskScore === undefined) {
      continue;
    }
    if (highestRisk === null || riskScore > highestRisk) {
      highestRisk = riskScore;
    }
  }

  return {
    title: record.report.title,
    repositoryName: record.report.repository.name ?? record.report.title,
    findingCount: findings.length,
    recommendationCount: recommendations.length,
    highestRisk,
    analyzedAt: record.report.repository.analyzedAt || record.savedAt,
  };
}

export function findingCountLabel(findingCount: number): string {
  if (findingCount === 1) {
    return "1 finding";
  }
  return `${findingCount} findings`;
}

export function recommendationCountLabel(recommendationCount: number): string {
  if (recommendationCount === 1) {
    return "1 recommendation";
  }
  return `${recommendationCount} recommendations`;
}

export function indexedStoreMatchesReport(input: IndexedStoreMatchInput): boolean {
  if (input.reportCommitSha && input.commitSha && input.reportCommitSha === input.commitSha) {
    return true;
  }
  if (input.reportRepositoryUrl && input.repoUrl && input.reportRepositoryUrl === input.repoUrl) {
    return true;
  }
  if (input.reportRepositoryName && input.sourceLabel.includes(input.reportRepositoryName)) {
    return true;
  }
  return false;
}
