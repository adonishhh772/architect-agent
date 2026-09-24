import { describe, expect, it } from "vitest";
import type { PersistedReportRecord } from "../persistence/indexedDbStore";
import {
  findingCountLabel,
  indexedStoreMatchesReport,
  recommendationCountLabel,
  summarizeWorkspaceRun,
} from "./workspaceRunSummary";
import { nextOpenRunId } from "./workspaceView";

describe("nextOpenRunId", () => {
  it("opens a closed workspace", () => {
    expect(nextOpenRunId(null, "run-a")).toBe("run-a");
  });

  it("closes the workspace that is already open", () => {
    expect(nextOpenRunId("run-a", "run-a")).toBeNull();
  });

  it("switches to a different workspace", () => {
    expect(nextOpenRunId("run-a", "run-b")).toBe("run-b");
  });
});

describe("summarizeWorkspaceRun", () => {
  it("uses the highest finding risk and falls back to the saved time", () => {
    const summary = summarizeWorkspaceRun(runRecord());
    expect(summary.highestRisk).toBe(18);
    expect(summary.findingCount).toBe(2);
    expect(summary.recommendationCount).toBe(1);
    expect(summary.repositoryName).toBe("payments-api");
    expect(summary.analyzedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("treats missing findings and recommendations as empty", () => {
    const record = runRecord();
    record.report.findings = undefined as unknown as PersistedReportRecord["report"]["findings"];
    record.report.recommendations = undefined as unknown as PersistedReportRecord["report"]["recommendations"];
    const summary = summarizeWorkspaceRun(record);
    expect(summary.findingCount).toBe(0);
    expect(summary.recommendationCount).toBe(0);
    expect(summary.highestRisk).toBeNull();
  });

  it("leaves highest risk empty when findings have no score", () => {
    const record = runRecord();
    record.report.findings = [{ riskScore: undefined }] as PersistedReportRecord["report"]["findings"];
    record.report.repository.analyzedAt = "";
    const summary = summarizeWorkspaceRun(record);
    expect(summary.highestRisk).toBeNull();
    expect(summary.analyzedAt).toBe(record.savedAt);
  });
});

describe("findingCountLabel", () => {
  it("uses the singular label for one finding", () => {
    expect(findingCountLabel(1)).toBe("1 finding");
    expect(findingCountLabel(0)).toBe("0 findings");
    expect(findingCountLabel(3)).toBe("3 findings");
  });
});

describe("recommendationCountLabel", () => {
  it("uses the singular label for one recommendation", () => {
    expect(recommendationCountLabel(1)).toBe("1 recommendation");
    expect(recommendationCountLabel(0)).toBe("0 recommendations");
  });
});

describe("indexedStoreMatchesReport", () => {
  const base = {
    sourceLabel: "org/other",
    repoUrl: "",
    commitSha: undefined,
    reportRepositoryName: "payments-api",
    reportRepositoryUrl: undefined,
    reportCommitSha: undefined,
  };

  it("matches the same commit", () => {
    expect(
      indexedStoreMatchesReport({
        ...base,
        commitSha: "abc",
        reportCommitSha: "abc",
      }),
    ).toBe(true);
  });

  it("matches the same repository url", () => {
    expect(
      indexedStoreMatchesReport({
        ...base,
        repoUrl: "https://github.com/org/payments-api",
        reportRepositoryUrl: "https://github.com/org/payments-api",
      }),
    ).toBe(true);
  });

  it("matches when the source label contains the repository name", () => {
    expect(
      indexedStoreMatchesReport({
        ...base,
        sourceLabel: "Indexed payments-api",
      }),
    ).toBe(true);
  });

  it("rejects a different repository", () => {
    expect(indexedStoreMatchesReport(base)).toBe(false);
  });
});

function runRecord(): PersistedReportRecord {
  return {
    id: "run-1",
    savedAt: "2026-05-01T00:00:00.000Z",
    agentWork: [],
    report: {
      id: "run-1",
      title: "payments-api threat model",
      repository: {
        name: "payments-api",
        analyzedAt: "2026-06-01T00:00:00.000Z",
      },
      findings: [{ riskScore: 8 }, { riskScore: 18 }],
      recommendations: [{ title: "Rotate the token" }],
    },
  } as unknown as PersistedReportRecord;
}
