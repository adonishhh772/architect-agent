import { describe, expect, it } from "vitest";
import { buildRepositoryStore } from "../../../ingestion/src/repository-store.js";
import { ANALYSIS_MODE } from "@sentinel/schema";
import { runAnalysisOrchestrator } from "../orchestrator.js";

describe("runAnalysisOrchestrator static mode", () => {
  it("produces findings without AI", async () => {
    const store = buildRepositoryStore([
      { path: "src/a.ts", content: "eval('1');\n" },
    ]);
    const report = await runAnalysisOrchestrator({
      mode: ANALYSIS_MODE.BROWSER,
      repository: {
        sourceType: "zip",
        name: "sample",
        analyzedAt: new Date().toISOString(),
      },
      store,
      enableAi: false,
    });
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.disclaimer.toLowerCase()).toContain("does not prove");
  });
});
