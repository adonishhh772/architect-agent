import { moduleNodeIdForPath } from "@sentinel/graph";
import {
  CWE_ID,
  FINDING_CATEGORY,
  FINDING_STATUS,
  OWASP_CATEGORY,
  RISK_DOMAIN,
  SOURCE_LANGUAGE,
  STRIDE_CATEGORY,
  type ArchitectureGraph,
  type Finding,
} from "@sentinel/schema";

export const SCANNER_RULE = {
  SECRET_TOKEN: "secret-token",
  SECRET_PRIVATE_KEY: "secret-private-key",
  SECRET_ASSIGNMENT: "secret-assignment",
  MISSING_AUTH: "missing-auth",
  SQL_INJECTION: "sql-injection",
  COMMAND_INJECTION: "command-injection",
  SSRF: "ssrf",
} as const;

const PLACEHOLDER_SECRET =
  /^(changeme|change-me|password|secret|example|placeholder|your[-_]?api[-_]?key|xxx+|todo|dummy|fake|test|redacted|<[^>]+>)$/i;

const TOKEN_PATTERNS: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, title: "Cloud access key pattern in source" },
  { pattern: /\bghp_[A-Za-z0-9]{20,}\b/, title: "GitHub token pattern in source" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, title: "GitHub token pattern in source" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, title: "Chat token pattern in source" },
];

const SECRET_ASSIGNMENT =
  /\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"]([^'"]{8,})['"]/i;

const ROUTE_LINE =
  /@(?:Get|Post|Put|Patch|Delete|Controller)\(|\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(/;

const AUTH_LINE = /\b(?:auth|guard|passport|jwt|session|UseGuards|authenticate)/i;

const SQL_LINE = /(?:\$queryRaw|queryRawUnsafe|\.query\s*\()[^;\n]{0,160}\$\{|\bSELECT\b[^;\n]*\$\{/i;

const COMMAND_LINE = /\b(?:exec|execSync)\s*\(\s*(?:req|request|`)/;

const SSRF_LINE =
  /\bfetch\s*\(\s*(?:req|request|url|target|endpoint|href)|\baxios\.(?:get|post|put|patch|delete)\s*\(\s*(?:req|request|url|target|endpoint)/;

export interface DeterministicScannerInput {
  contents: Map<string, string>;
  graph: ArchitectureGraph;
  commitSha?: string;
}

export function generateDeterministicFindings(input: DeterministicScannerInput): Finding[] {
  const knownNodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const findings: Finding[] = [];

  for (const [path, content] of input.contents) {
    const lines = content.split("\n");
    let sawRoute = false;
    let sawAuth = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      const lineNumber = lineIndex + 1;
      if (ROUTE_LINE.test(line)) {
        sawRoute = true;
      }
      if (AUTH_LINE.test(line)) {
        sawAuth = true;
      }
      findings.push(...secretFindings(path, line, lineNumber, knownNodeIds, input.commitSha));
      if (SQL_LINE.test(line)) {
        findings.push(
          buildScannerFinding({
            stableKey: `${SCANNER_RULE.SQL_INJECTION}-${path}-${lineNumber}`,
            title: "SQL query built from interpolated input",
            path,
            lineNumber,
            knownNodeIds,
            commitSha: input.commitSha,
            owasp: [OWASP_CATEGORY.INJECTION],
            stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
            status: FINDING_STATUS.CODE_SUPPORTED,
            scenario:
              "A query string is assembled with interpolation. If that value is request data, the database receives it as part of the query text.",
            mitigation: "Use parameterized queries or the ORM query builder. Keep request data out of query text.",
            confidence: 0.8,
            severityRationale: "Query interpolation can change which data the database reads or writes.",
            likelihoodRationale: "The interpolated value still needs to be traced to untrusted input.",
          }),
        );
      }
      if (COMMAND_LINE.test(line)) {
        findings.push(
          buildScannerFinding({
            stableKey: `${SCANNER_RULE.COMMAND_INJECTION}-${path}-${lineNumber}`,
            title: "Command execution uses a request or template argument",
            path,
            lineNumber,
            knownNodeIds,
            commitSha: input.commitSha,
            owasp: [OWASP_CATEGORY.INJECTION],
            stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
            status: FINDING_STATUS.PLAUSIBLE_THREAT,
            scenario:
              "A process is started from a template or request value. If that value is attacker-controlled, the host process can run unintended commands.",
            mitigation: "Avoid shell execution. Pass a fixed command and an argument array, and allow-list inputs.",
            confidence: 0.75,
            severityRationale: "Command execution in the application process is high impact.",
            likelihoodRationale: "Confirm the argument is not a fixed string.",
          }),
        );
      }
      if (SSRF_LINE.test(line)) {
        findings.push(
          buildScannerFinding({
            stableKey: `${SCANNER_RULE.SSRF}-${path}-${lineNumber}`,
            title: "Outbound request target may be request-controlled",
            path,
            lineNumber,
            knownNodeIds,
            commitSha: input.commitSha,
            owasp: [OWASP_CATEGORY.SSRF],
            stride: [STRIDE_CATEGORY.SPOOFING, STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
            status: FINDING_STATUS.PLAUSIBLE_THREAT,
            scenario:
              "An outbound HTTP call takes a variable target. If that variable comes from a request, the server can be induced to call internal addresses.",
            mitigation: "Allow-list destination hosts. Do not pass request URLs directly to the HTTP client.",
            confidence: 0.7,
            severityRationale: "Server-side requests can reach systems that are not exposed to the client.",
            likelihoodRationale: "Confirm the variable is derived from the request and is not a fixed host.",
          }),
        );
      }
    }
    if (sawRoute && !sawAuth) {
      findings.push(
        buildScannerFinding({
          stableKey: `${SCANNER_RULE.MISSING_AUTH}-${path}`,
          title: "HTTP route file has no visible authentication check",
          path,
          lineNumber: 1,
          knownNodeIds,
          commitSha: input.commitSha,
          owasp: [OWASP_CATEGORY.BROKEN_ACCESS_CONTROL, OWASP_CATEGORY.AUTHENTICATION_FAILURES],
          stride: [STRIDE_CATEGORY.SPOOFING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
          status: FINDING_STATUS.PLAUSIBLE_THREAT,
          scenario:
            "This file registers an HTTP route and does not mention an authentication guard, session, or token check.",
          mitigation: "Require an authentication guard on non-public routes. Keep public routes explicitly documented.",
          confidence: 0.55,
          severityRationale: "Missing authentication exposes the route to any caller who can reach it.",
          likelihoodRationale: "A guard in another file would not be visible to this file-level check.",
        }),
      );
    }
  }

  return findings;
}

function secretFindings(
  path: string,
  line: string,
  lineNumber: number,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding[] {
  const findings: Finding[] = [];
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
    findings.push(
      secretFinding(
        `${SCANNER_RULE.SECRET_PRIVATE_KEY}-${path}-${lineNumber}`,
        "Private key material committed in source",
        path,
        lineNumber,
        knownNodeIds,
        commitSha,
      ),
    );
  }
  for (const token of TOKEN_PATTERNS) {
    if (token.pattern.test(line)) {
      token.pattern.lastIndex = 0;
      findings.push(
        secretFinding(
          `${SCANNER_RULE.SECRET_TOKEN}-${path}-${lineNumber}`,
          token.title,
          path,
          lineNumber,
          knownNodeIds,
          commitSha,
        ),
      );
    }
    token.pattern.lastIndex = 0;
  }
  const assignment = SECRET_ASSIGNMENT.exec(line);
  SECRET_ASSIGNMENT.lastIndex = 0;
  const literal = assignment?.[2] ?? "";
  if (assignment && literal && !PLACEHOLDER_SECRET.test(literal) && !/process\.env/.test(line)) {
    findings.push(
      secretFinding(
        `${SCANNER_RULE.SECRET_ASSIGNMENT}-${path}-${lineNumber}`,
        "Credential assigned from a source literal",
        path,
        lineNumber,
        knownNodeIds,
        commitSha,
      ),
    );
  }
  return findings;
}

function secretFinding(
  stableKey: string,
  title: string,
  path: string,
  lineNumber: number,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding {
  return buildScannerFinding({
    stableKey,
    title,
    path,
    lineNumber,
    knownNodeIds,
    commitSha,
    owasp: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES, OWASP_CATEGORY.AUTHENTICATION_FAILURES],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE, STRIDE_CATEGORY.SPOOFING],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario:
      "A credential pattern is present in the indexed snapshot. The matched value is omitted from this report.",
    mitigation: "Remove the credential from source, rotate it, and load it from a secret manager.",
    confidence: 0.9,
    severityRationale: "A committed credential can be reused by anyone who can read the repository.",
    likelihoodRationale: "The pattern matched a known credential shape. Confirm it is not a revoked example.",
  });
}

interface ScannerDraft {
  stableKey: string;
  title: string;
  path: string;
  lineNumber: number;
  knownNodeIds: Set<string>;
  commitSha?: string;
  owasp: NonNullable<Finding["owaspCategories"]>;
  stride: Finding["strideCategories"];
  status: Finding["status"];
  scenario: string;
  mitigation: string;
  confidence: number;
  severityRationale: string;
  likelihoodRationale: string;
}

function cweForStableKey(stableKey: string): NonNullable<Finding["cweIds"]> {
  if (stableKey.startsWith(SCANNER_RULE.SQL_INJECTION)) {
    return [CWE_ID.SQL_INJECTION];
  }
  if (stableKey.startsWith(SCANNER_RULE.COMMAND_INJECTION)) {
    return [CWE_ID.COMMAND_INJECTION];
  }
  if (stableKey.startsWith(SCANNER_RULE.SSRF)) {
    return [CWE_ID.SSRF];
  }
  if (stableKey.startsWith(SCANNER_RULE.MISSING_AUTH)) {
    return [CWE_ID.MISSING_AUTHENTICATION];
  }
  if (stableKey.startsWith(SCANNER_RULE.SECRET_TOKEN) || stableKey.startsWith(SCANNER_RULE.SECRET_PRIVATE_KEY) || stableKey.startsWith(SCANNER_RULE.SECRET_ASSIGNMENT)) {
    return [CWE_ID.HARDCODED_CREDENTIAL];
  }
  return [];
}

function remediationForStableKey(stableKey: string): string | undefined {
  if (stableKey.startsWith(SCANNER_RULE.SQL_INJECTION)) {
    return "- query text built with interpolation\n+ parameterized query or ORM builder";
  }
  if (stableKey.startsWith(SCANNER_RULE.COMMAND_INJECTION)) {
    return "- process started from request data\n+ a fixed command and an argument array";
  }
  if (stableKey.startsWith(SCANNER_RULE.SSRF)) {
    return "- outbound request target taken from the request\n+ an allow-listed destination host";
  }
  if (stableKey.startsWith(SCANNER_RULE.MISSING_AUTH)) {
    return "- route with no guard\n+ route with an authentication guard";
  }
  if (stableKey.startsWith("secret-")) {
    return "- credential literal in source\n+ load the credential from a secret manager";
  }
  return undefined;
}

function languageForPath(path: string): Finding["language"] {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
    return SOURCE_LANGUAGE.JAVASCRIPT;
  }
  if (path.endsWith(".py")) {
    return SOURCE_LANGUAGE.PYTHON;
  }
  if (path.endsWith(".go")) {
    return SOURCE_LANGUAGE.GO;
  }
  return undefined;
}

function buildScannerFinding(draft: ScannerDraft): Finding {
  const moduleId = moduleNodeIdForPath(draft.path);
  return {
    id: `finding-${draft.stableKey}`,
    stableKey: draft.stableKey,
    title: draft.title,
    category: FINDING_CATEGORY.SECURITY,
    strideCategories: draft.stride,
    owaspCategories: draft.owasp,
    cweIds: cweForStableKey(draft.stableKey),
    language: languageForPath(draft.path),
    remediationDiff: remediationForStableKey(draft.stableKey),
    riskDomains: [RISK_DOMAIN.CYBERSECURITY],
    status: draft.status,
    affectedNodeIds: draft.knownNodeIds.has(moduleId) ? [moduleId] : [],
    affectedAssetSummary: draft.path,
    commitSha: draft.commitSha,
    references: [
      {
        path: draft.path,
        startLine: draft.lineNumber,
        endLine: draft.lineNumber,
        commitSha: draft.commitSha,
      },
    ],
    evidence: [],
    scenario: draft.scenario,
    preconditions: ["The indexed file is part of the deployed system"],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: draft.confidence,
    severityRationale: draft.severityRationale,
    likelihoodRationale: draft.likelihoodRationale,
    assumptions: ["Deterministic pattern match. The value itself is not stored in the finding."],
    openQuestions: [],
    mitigation: draft.mitigation,
    relatedFindingIds: [],
    attackPathIds: [],
  };
}
