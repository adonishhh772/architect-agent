import { describe, expect, it, vi } from "vitest";
import { extractArchitectureFromTypeScript, extractCallFlows } from "@sentinel/graph";
import type { AiProviderAdapter, ProviderSettings } from "@sentinel/providers";
import { FINDING_LIFECYCLE, FINDING_STATUS, type AuditMemory, type Finding } from "@sentinel/schema";
import { generateDeterministicFindings } from "../deterministic-scanners.js";
import { runFollowUpCopilot } from "../follow-up-copilot.js";
import { queryOsvAdvisories } from "../osv-advisory.js";
import { buildPullRequestReview, reconcileFindingLifecycle } from "../pull-request-gate.js";
import { buildRankedRecommendations, rankFindings } from "../risk-ranking.js";

const EMPTY_GRAPH = { nodes: [], edges: [] };

function sampleFinding(overrides: Partial<Finding> & Pick<Finding, "id" | "stableKey" | "title">): Finding {
  return {
    category: "security",
    strideCategories: ["tampering"],
    status: FINDING_STATUS.CODE_SUPPORTED,
    affectedNodeIds: [],
    affectedAssetSummary: "src/a.ts",
    references: [{ path: "src/a.ts", startLine: 1, endLine: 1 }],
    evidence: [],
    scenario: "scenario",
    preconditions: [],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: 0.8,
    severityRationale: "severity",
    likelihoodRationale: "likelihood",
    assumptions: [],
    openQuestions: [],
    mitigation: "Remove the unsafe call.",
    relatedFindingIds: [],
    attackPathIds: [],
    ...overrides,
  };
}

describe("deterministic scanners", () => {
  it("flags credential patterns without storing the secret value", () => {
    const contents = new Map<string, string>([
      ["src/config.ts", "const apiKey = \"production-token-value\";\nconst password = \"changeme\";\n"],
      ["src/cloud.ts", "const key = \"AKIAIOSFODNN7EXAMPLE\";\n"],
      ["src/routes.ts", "app.get(\"/admin\", handler);\n"],
      ["src/query.ts", "db.query(`SELECT * FROM users WHERE id = ${id}`);\n"],
      ["src/fetch.ts", "fetch(req.query.url);\n"],
    ]);
    const findings = generateDeterministicFindings({ contents, graph: EMPTY_GRAPH });
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("production-token-value");
    expect(serialized).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(findings.some((finding) => finding.stableKey.startsWith("secret-assignment-"))).toBe(true);
    expect(findings.some((finding) => finding.stableKey.startsWith("secret-token-"))).toBe(true);
    expect(findings.some((finding) => finding.title.includes("changeme"))).toBe(false);
    expect(findings.some((finding) => finding.stableKey.startsWith("missing-auth-"))).toBe(true);
    expect(findings.some((finding) => finding.stableKey.startsWith("sql-injection-"))).toBe(true);
    expect(findings.some((finding) => finding.stableKey.startsWith("ssrf-"))).toBe(true);
  });

  it("does not flag a route file that already mentions authentication", () => {
    const contents = new Map<string, string>([
      ["src/secure.ts", "app.get(\"/admin\", authMiddleware);\n"],
    ]);
    const findings = generateDeterministicFindings({ contents, graph: EMPTY_GRAPH });
    expect(findings.some((finding) => finding.stableKey.startsWith("missing-auth-"))).toBe(false);
  });
});

describe("queryOsvAdvisories", () => {
  it("creates a finding from a mocked advisory response", async () => {
    const contents = new Map<string, string>([
      ["package.json", JSON.stringify({ dependencies: { lodash: "4.17.15" } })],
      [
        "package-lock.json",
        JSON.stringify({
          packages: { "node_modules/lodash": { version: "4.17.15" } },
        }),
      ],
    ]);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [{ vulns: [{ id: "GHSA-test-0000", summary: "Prototype pollution in example package" }] }],
        }),
        { status: 200 },
      ),
    );
    const result = await queryOsvAdvisories(contents, EMPTY_GRAPH, { fetchImpl });
    expect(result.status).toBe("complete");
    expect(result.findings[0]?.stableKey).toContain("GHSA-test-0000");
    expect(result.findings[0]?.title).toContain("direct-only");
    expect(result.findings[0]?.status).toBe(FINDING_STATUS.PLAUSIBLE_THREAT);
    expect(result.findings[0]?.mitigation).toContain("Upgrade lodash");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("marks an imported package and a lockfile-only package separately", async () => {
    const contents = new Map<string, string>([
      ["package.json", JSON.stringify({ dependencies: { lodash: "4.17.15" } })],
      [
        "package-lock.json",
        JSON.stringify({
          packages: {
            "node_modules/lodash": { version: "4.17.15" },
            "node_modules/left-pad": { version: "1.3.0" },
          },
        }),
      ],
      ["src/app.ts", "import lodash from \"lodash\";\n"],
    ]);
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { queries: Array<{ package: { name: string } }> };
      return new Response(
        JSON.stringify({
          results: body.queries.map((query) => ({
            vulns: [{ id: `GHSA-${query.package.name}`, summary: "Example advisory" }],
          })),
        }),
        { status: 200 },
      );
    });
    const result = await queryOsvAdvisories(contents, EMPTY_GRAPH, { fetchImpl });
    const imported = result.findings.find((finding) => finding.title.includes("lodash"));
    const lockfileOnly = result.findings.find((finding) => finding.title.includes("left-pad"));
    expect(imported?.title).toContain("imported");
    expect(imported?.status).toBe(FINDING_STATUS.CODE_SUPPORTED);
    expect(lockfileOnly?.title).toContain("lockfile-only");
    expect(lockfileOnly?.status).toBe(FINDING_STATUS.INSUFFICIENT_EVIDENCE);
  });

  it("records a failure when the advisory service is unreachable", async () => {
    const contents = new Map<string, string>([
      ["requirements.txt", "requests==2.31.0\n"],
    ]);
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await queryOsvAdvisories(contents, EMPTY_GRAPH, { fetchImpl });
    expect(result.status).toBe("failed");
    expect(result.findings).toEqual([]);
    expect(result.detail).toContain("network down");
  });

  it("checks every package in a lockfile under the inventory limit", async () => {
    const packages: Record<string, { version: string }> = {};
    const dependencies: Record<string, string> = {};
    for (let index = 0; index < 120; index += 1) {
      const name = `pkg-${String(index).padStart(3, "0")}`;
      packages[`node_modules/${name}`] = { version: "1.0.0" };
      dependencies[name] = "1.0.0";
    }
    packages["node_modules/lodash"] = { version: "4.17.15" };
    const contents = new Map<string, string>([
      ["package.json", JSON.stringify({ dependencies: { ...dependencies, lodash: "4.17.15" } })],
      ["package-lock.json", JSON.stringify({ packages })],
      ["src/app.ts", "import lodash from \"lodash\";\n"],
    ]);
    const queried: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { queries: Array<{ package: { name: string } }> };
      for (const query of body.queries) {
        queried.push(query.package.name);
      }
      return new Response(JSON.stringify({ results: body.queries.map(() => ({ vulns: [] })) }), { status: 200 });
    });
    const result = await queryOsvAdvisories(contents, EMPTY_GRAPH, { fetchImpl });
    expect(result.status).toBe("complete");
    expect(queried).toContain("lodash");
    expect(queried).toHaveLength(121);
  });

  it("skips lookup when no lockfile coordinates exist", async () => {
    const fetchImpl = vi.fn();
    const result = await queryOsvAdvisories(new Map([["src/a.ts", "export const ready = true;\n"]]), EMPTY_GRAPH, {
      fetchImpl,
    });
    expect(result.status).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("risk ranking", () => {
  it("orders code execution above a duplicate title and emits one recommendation", () => {
    const ranked = rankFindings([
      sampleFinding({
        id: "finding-low",
        stableKey: "eval-src-low-1",
        title: "Shared weakness",
        status: FINDING_STATUS.ARCHITECTURE_CONCERN,
        category: "architecture",
        references: [{ path: "src/low.ts", startLine: 4, endLine: 4 }],
      }),
      sampleFinding({
        id: "finding-high",
        stableKey: "eval-src-app-1",
        title: "Shared weakness",
        status: FINDING_STATUS.CODE_SUPPORTED,
        references: [{ path: "src/high.ts", startLine: 12, endLine: 12 }],
      }),
    ]);
    const primary = ranked.find((finding) => !finding.duplicateOfStableKey);
    expect(primary?.stableKey).toBe("eval-src-app-1");
    expect(primary?.remediationRank).toBe(1);
    expect(primary?.riskScore).toBeGreaterThan(ranked.find((finding) => finding.duplicateOfStableKey)?.riskScore ?? 0);
    const recommendations = buildRankedRecommendations(ranked);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.relatedFindingIds).toContain("finding-low");
    expect(recommendations[0]?.citations.map((citation) => citation.path)).toEqual(["src/high.ts", "src/low.ts"]);
    expect(primary?.references.map((reference) => reference.path)).toEqual(["src/high.ts", "src/low.ts"]);
  });

  it("groups the same scanner rule across files and keeps a different rule separate", () => {
    const ranked = rankFindings([
      sampleFinding({
        id: "finding-sql-a",
        stableKey: "sql-injection-src-a-1",
        title: "Query built in the handler",
        cweIds: ["CWE-89"],
        references: [{ path: "src/a.ts", startLine: 3, endLine: 3 }],
      }),
      sampleFinding({
        id: "finding-sql-b",
        stableKey: "sql-injection-src-b-9",
        title: "Another query built from input",
        cweIds: ["CWE-89"],
        references: [{ path: "src/b.ts", startLine: 9, endLine: 9 }],
      }),
      sampleFinding({
        id: "finding-sql-format",
        stableKey: "sql-interpolation-src-c-2",
        title: "String formatted into SQL",
        cweIds: ["CWE-89"],
        references: [{ path: "src/c.ts", startLine: 2, endLine: 2 }],
      }),
    ]);
    const recommendations = buildRankedRecommendations(ranked);
    expect(recommendations).toHaveLength(2);
    const injection = recommendations.find((recommendation) => recommendation.relatedFindingIds.includes("finding-sql-b"));
    const interpolation = recommendations.find((recommendation) => recommendation.relatedFindingIds.includes("finding-sql-format"));
    expect(injection?.citations.map((citation) => citation.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(interpolation?.relatedFindingIds).toEqual(["finding-sql-format"]);
    expect(injection?.relatedFindingIds).not.toContain("finding-sql-format");
  });
});

describe("pull request gate", () => {
  it("marks a missing prior finding fixed and a returned finding regressed", () => {
    const priorMemory: AuditMemory = {
      repositoryKey: "acme/app",
      filesRead: [],
      filesPartial: [],
      filesUnread: [],
      openQuestions: [],
      priorFindingKeys: [],
      findingRecords: [
        { stableKey: "eval-src-a-1", lifecycle: FINDING_LIFECYCLE.OPEN },
        { stableKey: "secret-token-src-b-2", lifecycle: FINDING_LIFECYCLE.FIXED },
      ],
      pullRequestsReviewed: [],
      dispositions: [],
      updatedAt: "2026-09-23T12:00:00.000Z",
    };
    const lifecycle = reconcileFindingLifecycle({
      findings: [
        sampleFinding({
          id: "finding-secret",
          stableKey: "secret-token-src-b-2",
          title: "Cloud access key pattern in source",
        }),
      ],
      priorMemory,
      commitSha: "abc",
    });
    expect(lifecycle.fixedFindingKeys).toEqual(["eval-src-a-1"]);
    expect(lifecycle.regressedFindingKeys).toEqual(["secret-token-src-b-2"]);
    expect(lifecycle.findings[0]?.lifecycle).toBe(FINDING_LIFECYCLE.REGRESSED);
    const review = buildPullRequestReview({
      findings: lifecycle.findings,
      lifecycle,
      hasPriorMemory: true,
    });
    expect(review.commentBody).toContain("Advisory only");
    expect(review.commentBody).not.toContain("AKIA");
    expect(review.fixedFindingKeys).toContain("eval-src-a-1");
  });
});

describe("runFollowUpCopilot", () => {
  it("reads a tool result before answering", async () => {
    const contents = new Map<string, string>([["src/handler.ts", "function handleRequest(req) { eval(req.body.id); }\n"]]);
    const graph = extractArchitectureFromTypeScript({ files: contents });
    const flows = extractCallFlows(contents);
    expect(flows.flows.length).toBeGreaterThan(0);
    let round = 0;
    const provider: AiProviderAdapter = {
      providerId: "openai",
      settings: {
        providerId: "openai",
        modelId: "mock",
        customEndpointConfirmed: false,
        requestTimeoutMs: 1000,
        maxConcurrency: 1,
        maxRetries: 0,
      } satisfies ProviderSettings,
      testConnection: async () => ({ ok: true }),
      complete: async () => {
        round += 1;
        if (round === 1) {
          return {
            text: JSON.stringify({
              answer: "",
              citations: [],
              toolCalls: [{ tool: "traceDataFlow", args: { path: "src/handler.ts" } }],
            }),
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            model: "mock",
            finishReason: "stop",
          };
        }
        return {
          text: JSON.stringify({
            answer: "Request input reaches dynamic code execution in handleRequest.\nDo not include a payload.",
            citations: [{ path: "src/handler.ts", startLine: 1 }],
            toolCalls: [],
          }),
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          model: "mock",
          finishReason: "stop",
        };
      },
    };
    const result = await runFollowUpCopilot({
      question: "What reaches eval?",
      contents,
      graph,
      findings: [],
      provider,
      apiKey: "test-key",
    });
    expect(round).toBe(2);
    expect(result.answer).toContain("handleRequest");
    expect(result.answer.toLowerCase()).not.toContain("payload");
    expect(result.citations[0]?.path).toBe("src/handler.ts");
    expect(result.toolObservations.length).toBeGreaterThan(0);
  });
});
