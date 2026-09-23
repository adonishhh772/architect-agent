import { moduleNodeIdForPath } from "@sentinel/graph";
import {
  ATLAS_TECHNIQUE,
  FINDING_CATEGORY,
  FINDING_STATUS,
  OWASP_CATEGORY,
  PROVENANCE_KIND,
  RISK_DOMAIN,
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

function linkedNodeIds(path: string, knownNodeIds: Set<string>): string[] {
  const moduleId = moduleNodeIdForPath(path);
  return knownNodeIds.has(moduleId) ? [moduleId] : [];
}

export function generateStaticFindings(input: StaticFindingInput): Finding[] {
  const findings: Finding[] = [];
  const knownNodeIds = new Set(input.graph.nodes.map((node) => node.id));

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
          owaspCategories: [OWASP_CATEGORY.INJECTION],
          riskDomains: [RISK_DOMAIN.CYBERSECURITY],
          status: FINDING_STATUS.CODE_SUPPORTED,
          affectedNodeIds: linkedNodeIds(path, knownNodeIds),
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
          owaspCategories: [OWASP_CATEGORY.INJECTION],
          riskDomains: [RISK_DOMAIN.CYBERSECURITY],
          status: FINDING_STATUS.PLAUSIBLE_THREAT,
          affectedNodeIds: linkedNodeIds(path, knownNodeIds),
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
          owaspCategories: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES, OWASP_CATEGORY.AUTHENTICATION_FAILURES],
          atlasTechniqueIds: [ATLAS_TECHNIQUE.UNSECURED_CREDENTIALS],
          riskDomains: [RISK_DOMAIN.CYBERSECURITY, RISK_DOMAIN.DATA],
          status: FINDING_STATUS.CODE_SUPPORTED,
          affectedNodeIds: linkedNodeIds(path, knownNodeIds),
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
          owaspCategories: [OWASP_CATEGORY.INSECURE_DESIGN],
          riskDomains: [RISK_DOMAIN.CYBERSECURITY],
          status: FINDING_STATUS.ARCHITECTURE_CONCERN,
          affectedNodeIds: linkedNodeIds(path, knownNodeIds),
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
          owaspCategories: [OWASP_CATEGORY.LLM_EXCESSIVE_AGENCY],
          atlasTechniqueIds: [ATLAS_TECHNIQUE.AI_AGENT_TOOL_INVOCATION],
          riskDomains: [RISK_DOMAIN.AI_EXECUTION],
          status: FINDING_STATUS.PLAUSIBLE_THREAT,
          affectedNodeIds: linkedNodeIds(path, knownNodeIds),
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
      owaspCategories: [OWASP_CATEGORY.BROKEN_ACCESS_CONTROL, OWASP_CATEGORY.AUTHENTICATION_FAILURES],
      riskDomains: [RISK_DOMAIN.CYBERSECURITY],
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

  findings.push(...scanDeploymentAndDataRisks(input, knownNodeIds));
  return dedupeFindings(findings);
}

const PUBLISHED_PORT_LINE = /^\s*-\s*["']?\d{2,5}:\d{2,5}/;
const SECRET_LOG_LINE = /console\.(log|debug|info|warn)\([^)]*(password|secret|token|apiKey|credential)/i;
const COMPOSE_FILE_NAME = /docker-compose[^/]*\.ya?ml$/i;

function scanDeploymentAndDataRisks(input: StaticFindingInput, knownNodeIds: Set<string>): Finding[] {
  const findings: Finding[] = [];
  for (const [path, content] of input.contents) {
    const baseName = path.split("/").pop() ?? path;
    if (baseName === ".env") {
      findings.push(buildStaticFinding({
        stableKey: `env-file-${path}`,
        title: "Environment file with possible secrets is in the repository snapshot",
        category: FINDING_CATEGORY.SECURITY,
        strideCategories: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
        owaspCategories: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES, OWASP_CATEGORY.SECURITY_MISCONFIGURATION],
        atlasTechniqueIds: [ATLAS_TECHNIQUE.UNSECURED_CREDENTIALS],
        riskDomains: [RISK_DOMAIN.DATA, RISK_DOMAIN.INFRASTRUCTURE],
        status: FINDING_STATUS.CODE_SUPPORTED,
        path,
        lineNumber: 1,
        knownNodeIds,
        commitSha: input.commitSha,
        scenario: "A .env file is part of the indexed snapshot. Credentials in that file can ship with the repository or image.",
        mitigation: "Remove .env from the repository and load secrets from a managed store at deploy time.",
        confidence: 0.8,
        severityRationale: "Repository copies of environment files are a common credential leak.",
        likelihoodRationale: "Certain if the file is committed or included in the upload.",
      }));
    }

    if (!COMPOSE_FILE_NAME.test(path)) {
      continue;
    }
    const lines = content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      if (!PUBLISHED_PORT_LINE.test(line)) {
        continue;
      }
      findings.push(buildStaticFinding({
        stableKey: `published-port-${path}-${lineIndex + 1}`,
        title: "Compose file publishes a container port on the host",
        category: FINDING_CATEGORY.SECURITY,
        strideCategories: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
        owaspCategories: [OWASP_CATEGORY.SECURITY_MISCONFIGURATION],
        riskDomains: [RISK_DOMAIN.INFRASTRUCTURE],
        status: FINDING_STATUS.CODE_SUPPORTED,
        path,
        lineNumber: lineIndex + 1,
        knownNodeIds,
        commitSha: input.commitSha,
        scenario: "A published host port makes that service reachable outside the compose network wherever the host is reachable.",
        mitigation: "Prefer Docker-network expose for internal services. Publish a port only through an authenticated edge.",
        confidence: 0.75,
        severityRationale: "Exposed data stores and admin ports are a frequent deployment incident.",
        likelihoodRationale: "Depends on whether the host interface is reachable. Confirm the target environment.",
      }));
    }
  }

  for (const [path, content] of input.contents) {
    const lines = content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      if (!SECRET_LOG_LINE.test(line)) {
        continue;
      }
      findings.push(buildStaticFinding({
        stableKey: `secret-log-${path}-${lineIndex + 1}`,
        title: "Possible secret written to application logs",
        category: FINDING_CATEGORY.SECURITY,
        strideCategories: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
        owaspCategories: [OWASP_CATEGORY.LOGGING_FAILURES, OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES],
        atlasTechniqueIds: [ATLAS_TECHNIQUE.LLM_DATA_LEAKAGE],
        riskDomains: [RISK_DOMAIN.DATA],
        status: FINDING_STATUS.PLAUSIBLE_THREAT,
        path,
        lineNumber: lineIndex + 1,
        knownNodeIds,
        commitSha: input.commitSha,
        scenario: "Logging a password, token, or secret can copy it into log storage that has a wider audience than the application.",
        mitigation: "Log event identifiers. Keep credentials out of log lines and error messages.",
        confidence: 0.7,
        severityRationale: "Credential leakage through logs is durable and often retained.",
        likelihoodRationale: "Confirm the interpolated value is a secret and that the log sink is retained.",
      }));
    }
  }

  return findings;
}

interface StaticFindingDraft {
  stableKey: string;
  title: string;
  category: Finding["category"];
  strideCategories: Finding["strideCategories"];
  owaspCategories?: Finding["owaspCategories"];
  atlasTechniqueIds?: Finding["atlasTechniqueIds"];
  riskDomains?: Finding["riskDomains"];
  status: Finding["status"];
  path: string;
  lineNumber: number;
  knownNodeIds: Set<string>;
  commitSha?: string;
  scenario: string;
  mitigation: string;
  confidence: number;
  severityRationale: string;
  likelihoodRationale: string;
}

function buildStaticFinding(draft: StaticFindingDraft): Finding {
  return {
    id: findingId(draft.stableKey),
    stableKey: draft.stableKey,
    title: draft.title,
    category: draft.category,
    strideCategories: draft.strideCategories,
    owaspCategories: draft.owaspCategories,
    atlasTechniqueIds: draft.atlasTechniqueIds,
    riskDomains: draft.riskDomains,
    status: draft.status,
    affectedNodeIds: linkedNodeIds(draft.path, draft.knownNodeIds),
    affectedAssetSummary: draft.path,
    commitSha: draft.commitSha,
    references: [{ path: draft.path, startLine: draft.lineNumber, endLine: draft.lineNumber, commitSha: draft.commitSha }],
    evidence: [],
    scenario: draft.scenario,
    preconditions: ["The indexed file is part of the deployed system"],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: draft.confidence,
    severityRationale: draft.severityRationale,
    likelihoodRationale: draft.likelihoodRationale,
    assumptions: ["Static pattern match; runtime configuration may differ"],
    openQuestions: [],
    mitigation: draft.mitigation,
    relatedFindingIds: [],
    attackPathIds: [],
  };
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    byKey.set(finding.stableKey, finding);
  }
  return [...byKey.values()];
}
