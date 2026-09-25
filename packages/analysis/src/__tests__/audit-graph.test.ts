import { describe, expect, it } from "vitest";
import { moduleNodeIdForPath } from "@sentinel/graph";
import { buildRepositoryStore } from "@sentinel/ingestion";
import type { AiProviderAdapter } from "@sentinel/providers";
import {
  AGENT_RUN_STATUS,
  AUDIT_AGENT,
  FINDING_STATUS,
  OWASP_CATEGORY,
  type ProviderSettings,
} from "@sentinel/schema";
import { runMultiAgentAudit, shouldContinueReading } from "../audit-graph.js";
import { selectPathsForAgent } from "../evidence-packs.js";
import { verifyAuditFindings } from "../audit-verifier.js";
import { extractArchitectureFromTypeScript } from "@sentinel/graph";

const MOCK_SETTINGS: ProviderSettings = {
  providerId: "openai",
  modelId: "mock-model",
  customEndpointConfirmed: false,
  requestTimeoutMs: 1_000,
  maxConcurrency: 1,
  maxRetries: 0,
};

const SAMPLE_FILES = [
  { path: "src/app.ts", content: "export const app = 'NEEDLE_ARCHITECTURE';\napp.get('/health', () => 'ok');\n" },
  { path: "src/auth/session.ts", content: "export function login() { return 'session'; }\n" },
  { path: "src/routes/orders.ts", content: "export function createOrder() { return 'order'; }\n" },
  { path: "src/agent/runner.ts", content: "export async function runAgent(prompt: string) { return prompt; }\n" },
  { path: "src/logger.ts", content: "console.log(password);\n" },
  { path: "docker-compose.yml", content: "services:\n  db:\n    ports:\n      - \"5432:5432\"\n" },
];

describe("selectPathsForAgent", () => {
  it("prefers auth files for the STRIDE specialist", () => {
    const selected = selectPathsForAgent(
      SAMPLE_FILES.map((file) => file.path),
      AUDIT_AGENT.STRIDE,
      2,
    );
    expect(selected[0]).toBe("src/auth/session.ts");
  });

  it("returns no infrastructure paths when none match", () => {
    const selected = selectPathsForAgent(["README.md", "src/app.ts"], AUDIT_AGENT.INFRASTRUCTURE, 4);
    expect(selected).toEqual([]);
  });
});

describe("shouldContinueReading", () => {
  it("keeps reading while indexed files are still unread", () => {
    expect(shouldContinueReading(AGENT_RUN_STATUS.COMPLETED, 3, 1)).toBe(true);
    expect(shouldContinueReading(AGENT_RUN_STATUS.COMPLETED, 0, 1)).toBe(false);
    expect(shouldContinueReading(AGENT_RUN_STATUS.FAILED, 3, 1)).toBe(false);
    expect(shouldContinueReading(AGENT_RUN_STATUS.COMPLETED, 3, 24)).toBe(false);
    expect(shouldContinueReading(AGENT_RUN_STATUS.COMPLETED, 200, 24, 259)).toBe(true);
  });
});

describe("verifyAuditFindings", () => {
  it("downgrades a finding whose only citation is missing", () => {
    const store = buildRepositoryStore([{ path: "src/app.ts", content: "export const ready = true;\n" }]);
    const graph = extractArchitectureFromTypeScript({ files: store.contents });
    const [verified] = verifyAuditFindings(
      [
        {
          id: "finding-missing",
          stableKey: "missing",
          title: "Missing file",
          category: "security",
          strideCategories: ["spoofing"],
          status: FINDING_STATUS.PLAUSIBLE_THREAT,
          affectedNodeIds: [],
          affectedAssetSummary: "ghost.ts",
          references: [{ path: "ghost.ts", startLine: 1, endLine: 1 }],
          evidence: [],
          scenario: "scenario",
          preconditions: [],
          trustBoundaryCrossings: [],
          existingControls: [],
          counterevidence: [],
          confidence: 0.9,
          severityRationale: "severity",
          likelihoodRationale: "likelihood",
          assumptions: [],
          openQuestions: [],
          mitigation: "mitigation",
          relatedFindingIds: [],
          attackPathIds: [],
        },
      ],
      store.contents,
      graph,
    );
    expect(verified?.status).toBe(FINDING_STATUS.INSUFFICIENT_EVIDENCE);
    expect(verified?.confidence).toBeLessThanOrEqual(0.35);
  });
});

describe("runMultiAgentAudit", () => {
  it("runs every specialist, links cited modules, and follows a tool request", async () => {
    const store = buildRepositoryStore(SAMPLE_FILES);
    const graph = extractArchitectureFromTypeScript({ files: store.contents });
    const prompts: string[] = [];
    const steps: string[] = [];
    let requestsUsed = 0;
    const provider = createScriptedProvider(prompts);

    const result = await runMultiAgentAudit({
      context: { contents: store.contents, graph },
      provider,
      apiKey: "test-key",
      budget: { maxRequests: 20, maxTokens: 100_000 },
      onUsage: (usage) => {
        requestsUsed += 1;
        expect(usage.totalTokens).toBeGreaterThan(0);
      },
      getUsage: () => ({ requestsUsed, tokensUsed: requestsUsed * 20 }),
      onAgentStep: (update) => {
        steps.push(`${update.agentId}:${update.kind}:${update.step}`);
      },
    });

    expect(result.agentTrace.map((entry) => entry.agentId)).toEqual([
      AUDIT_AGENT.CODE_READER,
      AUDIT_AGENT.CODE_READER,
      AUDIT_AGENT.CODE_READER,
      AUDIT_AGENT.CODE_READER,
      AUDIT_AGENT.CODE_READER,
      AUDIT_AGENT.CODE_READER,
      AUDIT_AGENT.CARTOGRAPHER,
      AUDIT_AGENT.STRIDE,
      AUDIT_AGENT.OWASP,
      AUDIT_AGENT.ATLAS,
      AUDIT_AGENT.DATA,
      AUDIT_AGENT.INFRASTRUCTURE,
      AUDIT_AGENT.PULL_REQUEST,
      AUDIT_AGENT.VERIFIER,
    ]);
    expect(result.agentTrace.filter((entry) => entry.agentId !== AUDIT_AGENT.PULL_REQUEST).every((entry) => entry.status === AGENT_RUN_STATUS.COMPLETED)).toBe(true);
    expect(result.agentTrace.find((entry) => entry.agentId === AUDIT_AGENT.PULL_REQUEST)?.status).toBe(AGENT_RUN_STATUS.SKIPPED);
    expect(result.memory.filesUnread).toEqual([]);
    expect(result.agentTrace.find((entry) => entry.agentId === AUDIT_AGENT.STRIDE)?.detail).toContain("shared by the code reader");
    expect(result.agentTrace.find((entry) => entry.agentId === AUDIT_AGENT.OWASP)?.detail).toContain("shared by the code reader");
    expect(result.agentTrace.find((entry) => entry.agentId === AUDIT_AGENT.CARTOGRAPHER)?.detail).toContain("shared by the code reader");
    expect(result.filesSampled).toBe(SAMPLE_FILES.length);
    expect(result.architectureBrief).toContain("trust boundary");
    expect(result.architectureMermaid).toContain("flowchart TD");
    expect(result.architectureMermaid).toContain("API");
    const strideFinding = result.findings.find((finding) => finding.stableKey === "stride-session");
    expect(strideFinding?.affectedNodeIds).toContain(moduleNodeIdForPath("src/auth/session.ts"));
    expect(strideFinding?.owaspCategories).toContain(OWASP_CATEGORY.BROKEN_ACCESS_CONTROL);
    expect(result.attackPaths.some((path) => path.stepFindingIds.includes("finding-stride-stride-session"))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes("\"matches\""))).toBe(true);
    expect(steps.some((step) => step.includes("thinking:Cartographer mapped the indexed modules."))).toBe(true);
    expect(steps.some((step) => step.includes("searchCode on NEEDLE_ARCHITECTURE"))).toBe(true);
    expect(steps.some((step) => step.startsWith(`${AUDIT_AGENT.VERIFIER}:`))).toBe(true);
    expect(requestsUsed).toBeGreaterThanOrEqual(7);
  });

  it("skips later specialists when the request budget is exhausted", async () => {
    const store = buildRepositoryStore(SAMPLE_FILES);
    const graph = extractArchitectureFromTypeScript({ files: store.contents });
    let requestsUsed = 0;
    const result = await runMultiAgentAudit({
      context: { contents: store.contents, graph },
      provider: createScriptedProvider([]),
      apiKey: "test-key",
      budget: { maxRequests: 1, maxTokens: 100_000 },
      onUsage: () => {
        requestsUsed += 1;
      },
      getUsage: () => ({ requestsUsed, tokensUsed: 0 }),
    });

    const stride = result.agentTrace.find((entry) => entry.agentId === AUDIT_AGENT.STRIDE);
    const verifier = result.agentTrace.find((entry) => entry.agentId === AUDIT_AGENT.VERIFIER);
    expect(requestsUsed).toBe(1);
    expect(stride?.status).toBe(AGENT_RUN_STATUS.SKIPPED);
    expect(verifier?.status).toBe(AGENT_RUN_STATUS.COMPLETED);
  });
});

function createScriptedProvider(prompts: string[]): AiProviderAdapter {
  const roundsByAgent = new Map<string, number>();
  return {
    providerId: "openai",
    settings: MOCK_SETTINGS,
    testConnection: () => Promise.resolve({ ok: true }),
    complete: (_apiKey, request) => {
      const system = request.messages.find((message) => message.role === "system")?.content ?? "";
      const user = request.messages.find((message) => message.role === "user")?.content ?? "";
      prompts.push(user);
      const agentId = readAgentId(system);
      const round = (roundsByAgent.get(agentId) ?? 0) + 1;
      roundsByAgent.set(agentId, round);
      const text =
        agentId === AUDIT_AGENT.CARTOGRAPHER && round === 1
          ? JSON.stringify({
              toolCalls: [{ tool: "searchCode", args: { query: "NEEDLE_ARCHITECTURE", limit: 5 } }],
            })
          : JSON.stringify(responseForAgent(agentId));
      return Promise.resolve({
        text,
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        model: "mock-model",
        finishReason: "stop",
      });
    },
  };
}

function readAgentId(systemPrompt: string): string {
  const match = systemPrompt.match(/Agent role: ([a-z_]+)/);
  return match?.[1] ?? AUDIT_AGENT.CARTOGRAPHER;
}

function responseForAgent(agentId: string): Record<string, unknown> {
  if (agentId === AUDIT_AGENT.CARTOGRAPHER) {
    return {
      architectureBrief: "The app exposes HTTP at a trust boundary and calls an auth session module.",
      architectureMermaid: "flowchart TD\napp[\"App\"]\napi[\"API\"]\napp --> api",
      threatModelOverview: "Cartographer mapped the indexed modules.",
      findings: [
        draftFinding("cartographer-entry", "src/app.ts", "architecture", [], [], ["cybersecurity"]),
      ],
    };
  }
  if (agentId === AUDIT_AGENT.STRIDE) {
    return {
      threatModelOverview: "Session handling needs an authentication control.",
      findings: [
        draftFinding(
          "stride-session",
          "src/auth/session.ts",
          "security",
          ["spoofing"],
          ["A01:2021"],
          ["cybersecurity"],
        ),
      ],
      attackPaths: [
        {
          id: "stride-auth-path",
          title: "Unauthenticated session use",
          description: "A caller can reach session creation without an auth control on the entry module.",
          stepStableKeys: ["stride-session"],
        },
      ],
    };
  }
  if (agentId === AUDIT_AGENT.OWASP) {
    return {
      threatModelOverview: "Order route reviewed for injection and access control.",
      findings: [
        draftFinding("owasp-orders", "src/routes/orders.ts", "security", ["tampering"], ["A03:2021"], ["cybersecurity"]),
      ],
    };
  }
  if (agentId === AUDIT_AGENT.ATLAS) {
    return {
      threatModelOverview: "Agent runner accepts a prompt with no tool boundary.",
      findings: [
        draftFinding(
          "atlas-agent",
          "src/agent/runner.ts",
          "ai_security",
          ["tampering"],
          ["LLM01:2025"],
          ["ai_execution"],
          ["AML.T0051"],
        ),
      ],
    };
  }
  if (agentId === AUDIT_AGENT.DATA) {
    return {
      threatModelOverview: "Logger may write a secret.",
      findings: [
        draftFinding("data-log", "src/logger.ts", "security", ["information_disclosure"], ["A09:2021"], ["data"]),
      ],
    };
  }
  return {
    threatModelOverview: "Compose publishes a database port.",
    findings: [
      draftFinding(
        "infra-port",
        "docker-compose.yml",
        "security",
        ["information_disclosure"],
        ["A05:2021"],
        ["infrastructure"],
      ),
    ],
  };
}

function draftFinding(
  stableKey: string,
  path: string,
  category: string,
  strideCategories: string[],
  owaspCategories: string[],
  riskDomains: string[],
  atlasTechniqueIds: string[] = [],
): Record<string, unknown> {
  return {
    stableKey,
    title: stableKey,
    category,
    strideCategories,
    owaspCategories,
    atlasTechniqueIds,
    riskDomains,
    scenario: `${stableKey} is visible in ${path}`,
    mitigation: "Add the missing control and re-test.",
    confidence: 0.6,
    references: [{ path, startLine: 1, endLine: 2 }],
  };
}
