import { describe, expect, it } from "vitest";
import { extractArchitecture } from "@sentinel/graph";
import { FINDING_DISPOSITION, type AuditMemory, type Finding } from "@sentinel/schema";
import { applyStoredDispositions, findingsBlockingGate, rememberDisposition } from "../disposition.js";
import { runExecutableSkills } from "../language-detectors.js";
import { reportToSarif } from "../sarif-export.js";
import type { AnalysisReport } from "@sentinel/schema";

const EXPECTED_PREFIXES = [
  "sql-interpolation-app.py-",
  "deserialization-app.py-",
  "command-execution-main.go-",
  "route-auth-main.go-",
  "path-traversal-handler.js-",
  "dockerfile-root-Dockerfile-",
  "workflow-untrusted-checkout-.github/workflows/build.yml-",
];

function fixtureFiles(): Map<string, string> {
  return new Map<string, string>([
    [
      "app.py",
      [
        "def load_user():",
        "    user_id = request.args.get('id')",
        "    cursor.execute(f\"SELECT name FROM users WHERE id = {user_id}\")",
        "    return pickle.loads(request.data)",
        "",
        "def safe_user():",
        "    user_id = request.args.get('id')",
        "    cursor.execute(\"SELECT name FROM users WHERE id = %s\", (user_id,))",
      ].join("\n"),
    ],
    [
      "main.go",
      [
        "func handleSearch(w http.ResponseWriter, r *http.Request) {",
        "    query := r.FormValue(\"q\")",
        "    exec.Command(\"sh\", query)",
        "}",
        "func main() {",
        "    http.HandleFunc(\"/search\", handleSearch)",
        "}",
      ].join("\n"),
    ],
    [
      "handler.js",
      "function readUpload(req) {\n  return fs.readFileSync(path.join(req.query.dir, req.query.name));\n}\n",
    ],
    ["Dockerfile", "FROM alpine\nUSER root\n"],
    [".github/workflows/build.yml", "on:\n  pull_request_target:\njobs:\n  build:\n    runs-on: ubuntu-latest\n"],
  ]);
}

describe("polyglot security eval", () => {
  it("recalls expected weaknesses and does not flag a parameterized query", () => {
    const contents = fixtureFiles();
    const graph = extractArchitecture({ files: contents });
    const findings = runExecutableSkills({ contents, graph });
    const stableKeys = findings.map((finding) => finding.stableKey);
    const recalled = EXPECTED_PREFIXES.filter((prefix) => stableKeys.some((key) => key.startsWith(prefix)));
    const unexpected = findings.filter(
      (finding) => !EXPECTED_PREFIXES.some((prefix) => finding.stableKey.startsWith(prefix)),
    );
    expect(recalled).toEqual(EXPECTED_PREFIXES);
    expect(unexpected.map((finding) => finding.stableKey)).toEqual([]);
    expect(stableKeys.some((key) => key.includes("safe"))).toBe(false);
    expect(findings.every((finding) => (finding.cweIds ?? []).length > 0)).toBe(true);
    expect(findings.every((finding) => (finding.remediationDiff ?? "").length > 0)).toBe(true);
    const recall = recalled.length / EXPECTED_PREFIXES.length;
    const precision = (findings.length - unexpected.length) / findings.length;
    expect(recall).toBe(1);
    expect(precision).toBe(1);
  });
});

describe("disposition gate and SARIF", () => {
  it("drops false positives from the risk gate and emits SARIF", () => {
    const finding = {
      id: "finding-1",
      stableKey: "sql-interpolation-app.py-3",
      title: "SQL text built with an f-string or percent format",
      category: "security",
      strideCategories: [],
      status: "code_supported_weakness",
      affectedNodeIds: [],
      affectedAssetSummary: "app.py",
      references: [{ path: "app.py", startLine: 3 }],
      evidence: [],
      scenario: "Query text is interpolated.",
      preconditions: [],
      trustBoundaryCrossings: [],
      existingControls: [],
      counterevidence: [],
      confidence: 0.8,
      severityRationale: "Query text is interpolated.",
      likelihoodRationale: "Confirm the value.",
      assumptions: [],
      openQuestions: [],
      mitigation: "Bind parameters.",
      relatedFindingIds: [],
      attackPathIds: [],
      riskScore: 20,
      cweIds: ["CWE-89"],
    } satisfies Finding;
    const memory = rememberDisposition(emptyMemory(), finding.stableKey, FINDING_DISPOSITION.FALSE_POSITIVE);
    const disposed = applyStoredDispositions([finding], memory);
    expect(findingsBlockingGate(disposed, 16)).toEqual([]);
    expect(findingsBlockingGate([finding], 16)).toHaveLength(1);
    const sarif = JSON.parse(reportToSarif(minimalReport([finding]))) as { version: string; runs: Array<{ results: unknown[] }> };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.results).toHaveLength(1);
  });
});

function emptyMemory(): AuditMemory {
  return {
    repositoryKey: "fixture",
    filesRead: [],
    filesPartial: [],
    filesUnread: [],
    openQuestions: [],
    priorFindingKeys: [],
    findingRecords: [],
    pullRequestsReviewed: [],
    dispositions: [],
    updatedAt: "2026-09-23T12:00:00.000Z",
  };
}

function minimalReport(findings: Finding[]): AnalysisReport {
  return {
    schemaVersion: "1.0.0",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Fixture",
    mode: "deep_runner",
    repository: { sourceType: "zip", analyzedAt: "2026-09-23T12:00:00.000Z" },
    executiveSummary: "Fixture",
    disclaimer: "Advisory",
    graph: { nodes: [], edges: [] },
    findings,
    attackPaths: [],
    coverage: {
      totalFilesIndexed: 1,
      excludedFiles: 0,
      truncated: false,
      entries: [],
    },
    userCorrections: [],
    sbom: [],
    recommendations: [],
    budget: { tokensUsed: 0, requestsUsed: 0, partialCompletion: false },
    agentTrace: [],
  };
}
