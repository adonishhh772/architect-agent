import {
  FINDING_CATEGORY,
  FINDING_STATUS,
  PROVENANCE_KIND,
  STRIDE_CATEGORY,
  type ArchitectureGraph,
  type Finding,
} from "@sentinel/schema";
function createEvidenceId(): string {
  return globalThis.crypto.randomUUID();
}

export interface StaticFindingInput {
  contents: Map<string, string>;
  graph: ArchitectureGraph;
  commitSha?: string;
}

function findingId(stableKey: string): string {
  return `finding-${stableKey}`;
}

export function generateStaticFindings(input: StaticFindingInput): Finding[] {
  const findings: Finding[] = [];

  for (const [path, content] of input.contents) {
    const lines = content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      const lineNumber = lineIndex + 1;

      if (/eval\s*\(/.test(line)) {
        findings.push({
          id: findingId(`eval-${path}-${lineNumber}`),
          stableKey: `eval-${path}-${lineNumber}`,
          title: "Dynamic code execution via eval",
          category: FINDING_CATEGORY.SECURITY,
          strideCategories: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
          status: FINDING_STATUS.CODE_SUPPORTED,
          affectedNodeIds: [],
          affectedAssetSummary: path,
          commitSha: input.commitSha,
          references: [{ path, startLine: lineNumber, endLine: lineNumber, commitSha: input.commitSha }],
          evidence: [
            {
              id: createEvidenceId(),
              summary: "eval() can execute untrusted strings as code",
              provenance: {
                kind: PROVENANCE_KIND.OBSERVED,
                confidence: 0.9,
                references: [{ path, startLine: lineNumber, endLine: lineNumber }],
              },
              references: [{ path, startLine: lineNumber, endLine: lineNumber }],
            },
          ],
          scenario:
            "If attacker-controlled input reaches eval, they may execute arbitrary code in the application process.",
          preconditions: ["Attacker can influence input passed to eval"],
          trustBoundaryCrossings: ["Untrusted input to application runtime"],
          existingControls: [],
          counterevidence: [],
          confidence: 0.85,
          severityRationale: "Arbitrary code execution in the app process is typically high impact.",
          likelihoodRationale: "Depends on whether eval input is attacker-controlled; requires verification.",
          assumptions: ["Static pattern match; runtime data flow not fully proven"],
          openQuestions: ["Which callers pass data into this eval call?"],
          mitigation: "Remove eval; use safe parsing or explicit mapping tables.",
          suggestedVerificationTest: "Fuzz the endpoint feeding this code path and confirm eval is unreachable.",
          relatedFindingIds: [],
          attackPathIds: [],
        });
      }

      if (/dangerouslySetInnerHTML|innerHTML\s*=/.test(line)) {
        findings.push({
          id: findingId(`xss-${path}-${lineNumber}`),
          stableKey: `xss-${path}-${lineNumber}`,
          title: "Potential DOM XSS via HTML injection",
          category: FINDING_CATEGORY.SECURITY,
          strideCategories: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
          status: FINDING_STATUS.PLAUSIBLE_THREAT,
          affectedNodeIds: [],
          affectedAssetSummary: path,
          commitSha: input.commitSha,
          references: [{ path, startLine: lineNumber, endLine: lineNumber, commitSha: input.commitSha }],
          evidence: [],
          scenario: "Rendering untrusted HTML can enable cross-site scripting in user browsers.",
          preconditions: ["Untrusted content reaches this sink without sanitization"],
          trustBoundaryCrossings: ["Server or model output to browser DOM"],
          existingControls: [],
          counterevidence: [],
          confidence: 0.7,
          severityRationale: "XSS can compromise user sessions in the browser context.",
          likelihoodRationale: "Requires tracing data sources into this sink.",
          assumptions: [],
          openQuestions: ["Is DOMPurify or equivalent applied upstream?"],
          mitigation: "Prefer textContent, sanitize HTML with a vetted library, or use framework-safe bindings.",
          relatedFindingIds: [],
          attackPathIds: [],
        });
      }

      if (/process\.env\.[A-Z0-9_]+\s*\|\|\s*['"][^'"]+['"]/.test(line)) {
        findings.push({
          id: findingId(`secret-default-${path}-${lineNumber}`),
          stableKey: `secret-default-${path}-${lineNumber}`,
          title: "Hardcoded fallback secret or credential default",
          category: FINDING_CATEGORY.SECURITY,
          strideCategories: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE, STRIDE_CATEGORY.SPOOFING],
          status: FINDING_STATUS.CODE_SUPPORTED,
          affectedNodeIds: [],
          affectedAssetSummary: path,
          commitSha: input.commitSha,
          references: [{ path, startLine: lineNumber, endLine: lineNumber }],
          evidence: [],
          scenario:
            "Deploying without overriding environment variables may use predictable default credentials.",
          preconditions: ["Default value used in production deployment"],
          trustBoundaryCrossings: [],
          existingControls: [],
          counterevidence: [],
          confidence: 0.8,
          severityRationale: "Predictable secrets weaken authentication and encryption.",
          likelihoodRationale: "Common in dev templates accidentally promoted to production.",
          assumptions: [],
          openQuestions: [],
          mitigation: "Require secrets from a managed secret store; fail startup if missing.",
          relatedFindingIds: [],
          attackPathIds: [],
        });
      }

      if (/while\s*\(\s*true\s*\)/.test(line)) {
        findings.push({
          id: findingId(`unbounded-loop-${path}-${lineNumber}`),
          stableKey: `unbounded-loop-${path}-${lineNumber}`,
          title: "Unbounded loop may block event loop or agent runtime",
          category: FINDING_CATEGORY.ARCHITECTURE,
          strideCategories: [STRIDE_CATEGORY.DENIAL_OF_SERVICE],
          status: FINDING_STATUS.ARCHITECTURE_CONCERN,
          affectedNodeIds: [],
          affectedAssetSummary: path,
          commitSha: input.commitSha,
          references: [{ path, startLine: lineNumber, endLine: lineNumber }],
          evidence: [],
          scenario: "A tight infinite loop can freeze workers and deny service to other tasks.",
          preconditions: ["Loop runs on main thread or shared worker without external break"],
          trustBoundaryCrossings: [],
          existingControls: [],
          counterevidence: [],
          confidence: 0.75,
          severityRationale: "Availability impact for the hosting process.",
          likelihoodRationale: "Certain if branch is reachable.",
          assumptions: [],
          openQuestions: [],
          mitigation: "Use event-driven iteration, queues, or bounded polling with backoff.",
          architecturalTradeoffs: "Event-driven designs add complexity but improve isolation.",
          relatedFindingIds: [],
          attackPathIds: [],
        });
      }

      if (/\b(tool|executeTool|runTool)\s*\([^)]*user/.test(line) && !/authorize|permission|acl/i.test(content)) {
        findings.push({
          id: findingId(`ai-tool-auth-${path}-${lineNumber}`),
          stableKey: `ai-tool-auth-${path}-${lineNumber}`,
          title: "AI tool invocation may lack explicit user-level authorization",
          category: FINDING_CATEGORY.AI_SECURITY,
          strideCategories: [STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE, STRIDE_CATEGORY.TAMPERING],
          status: FINDING_STATUS.PLAUSIBLE_THREAT,
          affectedNodeIds: [],
          affectedAssetSummary: path,
          commitSha: input.commitSha,
          references: [{ path, startLine: lineNumber, endLine: lineNumber }],
          evidence: [],
          scenario:
            "Model-selected tool calls could perform actions beyond the requesting user's permissions.",
          preconditions: ["Tool executes with service credentials rather than user-scoped credentials"],
          trustBoundaryCrossings: ["LLM planner to privileged tool runtime"],
          existingControls: [],
          counterevidence: [],
          confidence: 0.65,
          severityRationale: "Excessive tool authority is a common agent compromise path.",
          likelihoodRationale: "Requires confirming auth checks on tool dispatch path.",
          assumptions: [],
          openQuestions: ["Are tools scoped per tenant and per user?"],
          mitigation: "Enforce authorization at tool boundary with user/tenant context from trusted session.",
          relatedFindingIds: [],
          attackPathIds: [],
        });
      }
    }
  }

  const apiNodes = input.graph.nodes.filter((node) => node.kind === "api_entry");
  const authModules = [...input.contents.keys()].filter(
    (path) => path.includes("auth") || path.includes("guard") || path.includes("middleware"),
  );
  if (apiNodes.length > 0 && authModules.length === 0) {
    findings.push({
      id: findingId("missing-auth-layer"),
      stableKey: "missing-auth-layer",
      title: "HTTP entry points detected without obvious auth middleware module",
      category: FINDING_CATEGORY.ARCHITECTURE,
      strideCategories: [STRIDE_CATEGORY.SPOOFING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
      status: FINDING_STATUS.INSUFFICIENT_EVIDENCE,
      affectedNodeIds: apiNodes.map((node) => node.id),
      affectedAssetSummary: "API entry points",
      commitSha: input.commitSha,
      references: [],
      evidence: [],
      scenario: "Public routes may be reachable without authentication if not enforced elsewhere.",
      preconditions: ["Routes are exposed publicly"],
      trustBoundaryCrossings: ["Internet to application API"],
      existingControls: [],
      counterevidence: authModules.length > 0 ? ["Auth-related modules present"] : [],
      confidence: 0.45,
      severityRationale: "Missing auth controls can expose data and actions.",
      likelihoodRationale: "Auth may exist under non-standard paths; verification required.",
      assumptions: ["Heuristic based on module naming and route extraction"],
      openQuestions: ["Where is authentication enforced for each route?"],
      mitigation: "Document and centralize authentication middleware; add per-route guard tests.",
      relatedFindingIds: [],
      attackPathIds: [],
    });
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    byKey.set(finding.stableKey, finding);
  }
  return [...byKey.values()];
}
