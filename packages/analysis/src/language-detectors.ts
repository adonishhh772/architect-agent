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
import { isGoPath, isJavaScriptPath, isPythonPath } from "@sentinel/graph";

export const DETECTOR_RULE = {
  PATH_TRAVERSAL: "path-traversal",
  XSS: "xss-markup",
  DESERIALIZATION: "deserialization",
  JWT: "jwt-verification",
  COOKIE: "insecure-cookie",
  WEAK_CRYPTO: "weak-crypto",
  WEAK_RANDOM: "weak-random",
  MISSING_AUTH: "route-auth",
  SQL: "sql-interpolation",
  COMMAND: "command-execution",
  DOCKER_ROOT: "dockerfile-root",
  WORKFLOW: "workflow-untrusted-checkout",
  SUPPLY_CHAIN: "supply-chain-pipe",
} as const;

const AUTH_WINDOW = 12;

const AUTH_HINT =
  /\b(?:auth|jwt|login_required|Depends\(|UseGuards|middleware|authenticate|session|Authorization)\b/i;

interface DetectorInput {
  contents: Map<string, string>;
  graph: ArchitectureGraph;
  commitSha?: string;
}

interface LineRule {
  id: string;
  title: string;
  pattern: RegExp;
  cwe: (typeof CWE_ID)[keyof typeof CWE_ID];
  owasp: NonNullable<Finding["owaspCategories"]>;
  stride: Finding["strideCategories"];
  status: Finding["status"];
  scenario: string;
  mitigation: string;
  remediationDiff: string;
  confidence: number;
}

const JAVASCRIPT_RULES: LineRule[] = [
  {
    id: DETECTOR_RULE.PATH_TRAVERSAL,
    title: "File path built from request data",
    pattern: /path\.join\(\s*(?:req|request)|\breadFile(?:Sync)?\(\s*(?:req|request|path\.join\(\s*req)/,
    cwe: CWE_ID.PATH_TRAVERSAL,
    owasp: [OWASP_CATEGORY.BROKEN_ACCESS_CONTROL],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE, STRIDE_CATEGORY.TAMPERING],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "A filesystem path is assembled from request data. If that value is not constrained, the process can read or write outside the intended directory.",
    mitigation: "Resolve the path, confirm it stays under an allowed root, and reject values that escape that root.",
    remediationDiff: "- request data concatenated into a filesystem path\n+ resolve under a fixed root and reject paths that escape it",
    confidence: 0.75,
  },
  {
    id: DETECTOR_RULE.WEAK_CRYPTO,
    title: "Password or token hashed with a broken algorithm",
    pattern: /createHash\(\s*['"](?:md5|sha1)['"]/,
    cwe: CWE_ID.WEAK_CRYPTO,
    owasp: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "MD5 or SHA-1 is used as a hash. Those algorithms are not suitable for passwords or long-lived tokens.",
    mitigation: "Use a password hashing function designed for credentials, or SHA-256 or stronger for non-password checksums.",
    remediationDiff: "- broken hash for a password or token\n+ a password hash function, or SHA-256 for a non-secret checksum",
    confidence: 0.8,
  },
  {
    id: DETECTOR_RULE.WEAK_RANDOM,
    title: "Security value drawn from a non-cryptographic generator",
    pattern: /Math\.random\(\)/,
    cwe: CWE_ID.INSUFFICIENT_RANDOM,
    owasp: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES],
    stride: [STRIDE_CATEGORY.SPOOFING],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "Math.random is not a cryptographic generator. Tokens, secrets, and session identifiers built from it can be predicted.",
    mitigation: "Use the platform cryptographic random API for tokens, secrets, and session identifiers.",
    remediationDiff: "- non-cryptographic generator for a secret\n+ the platform cryptographic random API for secrets and tokens",
    confidence: 0.45,
  },
];

const PYTHON_RULES: LineRule[] = [
  {
    id: DETECTOR_RULE.SQL,
    title: "SQL text built with an f-string or percent format",
    pattern: /\.execute\(\s*f["']|\.execute\(\s*["'][^"']*%[sd][^"']*["']\s*%/,
    cwe: CWE_ID.SQL_INJECTION,
    owasp: [OWASP_CATEGORY.INJECTION],
    stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "Query text is built with interpolation. If the interpolated value is request data, the database receives it as part of the query.",
    mitigation: "Pass a fixed query and bind parameters separately.",
    remediationDiff: "- query text built with interpolation\n+ a fixed query with bound parameters",
    confidence: 0.85,
  },
  {
    id: DETECTOR_RULE.DESERIALIZATION,
    title: "Untrusted bytes passed to a deserializer",
    pattern: /\bpickle\.loads\s*\(|\byaml\.load\s*\((?![^)\n]*SafeLoader)/,
    cwe: CWE_ID.DESERIALIZATION,
    owasp: [OWASP_CATEGORY.INTEGRITY_FAILURES],
    stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "pickle.loads and yaml.load reconstruct objects from data. If that data is request-controlled, the process can be made to run unintended code paths.",
    mitigation: "Do not unpickle request data. Use json or yaml.safe_load for untrusted documents.",
    remediationDiff: "- object deserializer on untrusted bytes\n+ a data-only parser such as JSON or a safe YAML loader",
    confidence: 0.8,
  },
  {
    id: DETECTOR_RULE.XSS,
    title: "HTML marked safe or rendered from a template string",
    pattern: /\bmark_safe\s*\(|\bMarkup\s*\(|\brender_template_string\s*\(/,
    cwe: CWE_ID.XSS,
    owasp: [OWASP_CATEGORY.INJECTION],
    stride: [STRIDE_CATEGORY.TAMPERING],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "HTML is marked trusted or rendered from a string. If request data reaches that string, the browser will treat it as markup.",
    mitigation: "Render a fixed template and escape interpolated values. Do not mark request data as safe HTML.",
    remediationDiff: "- request data marked as trusted HTML\n+ escape the value in a fixed template",
    confidence: 0.7,
  },
  {
    id: DETECTOR_RULE.COMMAND,
    title: "Shell command built in Python",
    pattern: /\bos\.system\s*\(|\bsubprocess\.(?:call|run|Popen|check_output)\s*\(\s*(?:f["']|.*shell\s*=\s*True)/,
    cwe: CWE_ID.COMMAND_INJECTION,
    owasp: [OWASP_CATEGORY.INJECTION],
    stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "A shell command is started from a string or with the shell enabled. If any part of that string is request data, the host process can run unintended commands.",
    mitigation: "Pass a fixed executable and an argument array. Do not enable the shell.",
    remediationDiff: "- shell command built from a string\n+ a fixed executable and an argument array, with the shell disabled",
    confidence: 0.75,
  },
  {
    id: DETECTOR_RULE.JWT,
    title: "JWT verification disabled or none algorithm allowed",
    pattern: /jwt\.decode\([^)\n]*verify\s*=\s*False|algorithms\s*=\s*\[[^\]]*(['"])none\1/,
    cwe: CWE_ID.IMPROPER_VERIFICATION,
    owasp: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES, OWASP_CATEGORY.AUTHENTICATION_FAILURES],
    stride: [STRIDE_CATEGORY.SPOOFING],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "Token verification is turned off or the none algorithm is allowed. Callers can present a token the application will accept without checking a signature.",
    mitigation: "Verify signatures with an explicit allow-list of asymmetric or HMAC algorithms. Do not allow none.",
    remediationDiff: "- token accepted without signature verification\n+ verify the signature with an explicit algorithm allow-list",
    confidence: 0.9,
  },
  {
    id: DETECTOR_RULE.COOKIE,
    title: "Session cookie sent without the secure flag",
    pattern: /SESSION_COOKIE_SECURE\s*=\s*False|secure\s*=\s*False/,
    cwe: CWE_ID.SENSITIVE_COOKIE,
    owasp: [OWASP_CATEGORY.SECURITY_MISCONFIGURATION],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "A cookie is configured without the secure flag, so a browser may send it on an unencrypted connection.",
    mitigation: "Set Secure and HttpOnly on session cookies. Keep SameSite explicit.",
    remediationDiff: "- session cookie allowed on an unencrypted connection\n+ set the secure and HttpOnly cookie flags",
    confidence: 0.7,
  },
  {
    id: DETECTOR_RULE.WEAK_CRYPTO,
    title: "Broken hash used in Python",
    pattern: /\bhashlib\.(?:md5|sha1)\s*\(/,
    cwe: CWE_ID.WEAK_CRYPTO,
    owasp: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "MD5 or SHA-1 is used as a hash. Those algorithms are not suitable for passwords or long-lived tokens.",
    mitigation: "Use a password hashing function for credentials. Use SHA-256 or stronger for checksums.",
    remediationDiff: "- broken hash for a password or token\n+ SHA-256 for a checksum, or a password hash for a secret",
    confidence: 0.8,
  },
];

const GO_RULES: LineRule[] = [
  {
    id: DETECTOR_RULE.COMMAND,
    title: "Process started from a Go command builder",
    pattern: /\bexec\.Command\s*\(/,
    cwe: CWE_ID.COMMAND_INJECTION,
    owasp: [OWASP_CATEGORY.INJECTION],
    stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "A process is started with exec.Command. If any argument is request data, the host can run an unintended program or arguments.",
    mitigation: "Use a fixed executable. Allow-list arguments. Do not pass a shell with request text.",
    remediationDiff: "- process started from request data\n+ a fixed executable and an allow-listed argument",
    confidence: 0.7,
  },
  {
    id: DETECTOR_RULE.SQL,
    title: "SQL text built with fmt.Sprintf",
    pattern: /\.(?:Query|Exec|QueryRow)\(\s*fmt\.Sprintf\s*\(/,
    cwe: CWE_ID.SQL_INJECTION,
    owasp: [OWASP_CATEGORY.INJECTION],
    stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "Query text is formatted before it is sent to the database. If a formatted value is request data, it becomes part of the query.",
    mitigation: "Use placeholders and pass request values as arguments.",
    remediationDiff: "- query text formatted before it is sent\n+ placeholders with the request value passed as an argument",
    confidence: 0.85,
  },
  {
    id: DETECTOR_RULE.XSS,
    title: "HTML type used on a string in Go",
    pattern: /\btemplate\.HTML\s*\(/,
    cwe: CWE_ID.XSS,
    owasp: [OWASP_CATEGORY.INJECTION],
    stride: [STRIDE_CATEGORY.TAMPERING],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "template.HTML marks a string as already safe. If that string includes request data, the browser will treat it as markup.",
    mitigation: "Leave escaping to html/template. Do not cast request data to template.HTML.",
    remediationDiff: "- string marked as already-safe HTML\n+ leave escaping to the HTML template package",
    confidence: 0.75,
  },
  {
    id: DETECTOR_RULE.WEAK_CRYPTO,
    title: "Broken hash used in Go",
    pattern: /\b(?:md5|sha1)\.New\s*\(/,
    cwe: CWE_ID.WEAK_CRYPTO,
    owasp: [OWASP_CATEGORY.CRYPTOGRAPHIC_FAILURES],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.CODE_SUPPORTED,
    scenario: "MD5 or SHA-1 is used as a hash. Those algorithms are not suitable for passwords or long-lived tokens.",
    mitigation: "Use a password hashing function for credentials. Use SHA-256 or stronger for checksums.",
    remediationDiff: "- broken hash for a password or token\n+ SHA-256 for a checksum, or a password hash for a secret",
    confidence: 0.8,
  },
  {
    id: DETECTOR_RULE.PATH_TRAVERSAL,
    title: "File path joined from request data in Go",
    pattern: /filepath\.Join\([^)\n]*(?:FormValue|Query\(|Param\()/,
    cwe: CWE_ID.PATH_TRAVERSAL,
    owasp: [OWASP_CATEGORY.BROKEN_ACCESS_CONTROL],
    stride: [STRIDE_CATEGORY.INFORMATION_DISCLOSURE],
    status: FINDING_STATUS.PLAUSIBLE_THREAT,
    scenario: "A filesystem path includes request data. If that value is not constrained, the process can leave the intended directory.",
    mitigation: "Clean the path and reject values that escape a fixed root.",
    remediationDiff: "- filepath.Join(root, request value)\n+ filepath.Rel check that the result stays under root",
    confidence: 0.75,
  },
];

const PYTHON_ROUTE = /@(?:app|router|bp|api)\.(?:route|get|post|put|patch|delete)\(/;
const GO_ROUTE = /(?:http\.HandleFunc|\.HandleFunc|\.(?:GET|POST|PUT|PATCH|DELETE))\(\s*"/;
const JAVASCRIPT_ROUTE = /(?:app|router)\.(?:get|post|put|patch|delete)\s*\(|@(?:Get|Post|Put|Patch|Delete)\(/;

export function runExecutableSkills(input: DetectorInput): Finding[] {
  const knownNodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const findings: Finding[] = [];
  for (const [path, content] of input.contents) {
    findings.push(...scanFile(path, content, knownNodeIds, input.commitSha));
  }
  return findings;
}

function scanFile(
  path: string,
  content: string,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding[] {
  if (isDockerPath(path)) {
    return dockerFindings(path, content, knownNodeIds, commitSha);
  }
  if (isWorkflowPath(path)) {
    return workflowFindings(path, content, knownNodeIds, commitSha);
  }
  const rules = rulesFor(path);
  if (!rules) {
    return supplyChainFindings(path, content, knownNodeIds, commitSha);
  }
  const lines = content.split("\n");
  const findings: Finding[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    for (const rule of rules) {
      if (!rule.pattern.test(line)) {
        rule.pattern.lastIndex = 0;
        continue;
      }
      rule.pattern.lastIndex = 0;
      if (rule.id === DETECTOR_RULE.WEAK_RANDOM && !/token|secret|password|session/i.test(line)) {
        continue;
      }
      if (rule.id === DETECTOR_RULE.COOKIE && !/cookie|session/i.test(line) && !/SESSION_COOKIE_SECURE/.test(line)) {
        continue;
      }
      findings.push(toFinding(rule, path, lineNumber, knownNodeIds, commitSha));
    }
    if ((isPythonPath(path) || isGoPath(path)) && isRouteLine(path, line) && !authNearby(lines, index)) {
      findings.push(missingAuthFinding(path, lineNumber, knownNodeIds, commitSha));
    }
  }
  findings.push(...supplyChainFindings(path, content, knownNodeIds, commitSha));
  return findings;
}

function rulesFor(path: string): LineRule[] | undefined {
  if (isJavaScriptPath(path)) {
    return JAVASCRIPT_RULES;
  }
  if (isPythonPath(path)) {
    return PYTHON_RULES;
  }
  if (isGoPath(path)) {
    return GO_RULES;
  }
  return undefined;
}

function isRouteLine(path: string, line: string): boolean {
  if (isPythonPath(path)) {
    return PYTHON_ROUTE.test(line);
  }
  if (isGoPath(path)) {
    return GO_ROUTE.test(line);
  }
  if (isJavaScriptPath(path)) {
    return JAVASCRIPT_ROUTE.test(line);
  }
  return false;
}

function authNearby(lines: string[], index: number): boolean {
  const start = Math.max(0, index - 2);
  const end = Math.min(lines.length, index + AUTH_WINDOW);
  for (let cursor = start; cursor < end; cursor += 1) {
    if (AUTH_HINT.test(lines[cursor] ?? "")) {
      return true;
    }
  }
  return false;
}

function isDockerPath(path: string): boolean {
  return /(^|\/)Dockerfile$/i.test(path);
}

function isWorkflowPath(path: string): boolean {
  return /^\.github\/workflows\/.+\.ya?ml$/i.test(path);
}

function dockerFindings(
  path: string,
  content: string,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding[] {
  const hasUser = /^USER\s+\S+/m.test(content);
  const rootUser = /^USER\s+root\b/m.test(content);
  if (hasUser && !rootUser) {
    return supplyChainFindings(path, content, knownNodeIds, commitSha);
  }
  const lineNumber = lineOf(content, /^USER\s+root\b/m) ?? 1;
  return [
    toFinding(
      {
        id: DETECTOR_RULE.DOCKER_ROOT,
        title: rootUser ? "Container runs as root" : "Container image does not set a user",
        pattern: /$^/,
        cwe: CWE_ID.UNNECESSARY_PRIVILEGES,
        owasp: [OWASP_CATEGORY.SECURITY_MISCONFIGURATION],
        stride: [STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
        status: FINDING_STATUS.CODE_SUPPORTED,
        scenario: "The image runs as root or never sets USER. A process compromise then has root in the container.",
        mitigation: "Add a non-root USER and run the process as that user.",
        remediationDiff: "- image process runs as root\n+ a dedicated non-root user",
        confidence: 0.8,
      },
      path,
      lineNumber,
      knownNodeIds,
      commitSha,
    ),
    ...supplyChainFindings(path, content, knownNodeIds, commitSha),
  ];
}

function workflowFindings(
  path: string,
  content: string,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding[] {
  const findings = supplyChainFindings(path, content, knownNodeIds, commitSha);
  if (!/pull_request_target\s*:/.test(content)) {
    return findings;
  }
  return [
    toFinding(
      {
        id: DETECTOR_RULE.WORKFLOW,
        title: "Workflow trigger checks out untrusted pull request code with elevated permissions",
        pattern: /$^/,
        cwe: CWE_ID.CODE_INJECTION,
        owasp: [OWASP_CATEGORY.INTEGRITY_FAILURES],
        stride: [STRIDE_CATEGORY.TAMPERING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
        status: FINDING_STATUS.PLAUSIBLE_THREAT,
        scenario: "pull_request_target runs with the base repository's credentials. Checking out the pull request head in that job runs untrusted code with those credentials.",
        mitigation: "Use pull_request for untrusted code. Do not check out the pull request head in a pull_request_target job that has secrets.",
        remediationDiff: "- untrusted pull request code in a privileged workflow\n+ the untrusted pull request event, with secrets kept off that job",
        confidence: 0.7,
      },
      path,
      lineOf(content, /pull_request_target\s*:/) ?? 1,
      knownNodeIds,
      commitSha,
    ),
    ...findings,
  ];
}

function supplyChainFindings(
  path: string,
  content: string,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding[] {
  const matchLine = lineOf(content, /curl[^|\n]{0,120}\|\s*(?:sh|bash)/);
  if (!matchLine) {
    return [];
  }
  return [
    toFinding(
      {
        id: DETECTOR_RULE.SUPPLY_CHAIN,
        title: "Remote script is piped into a shell",
        pattern: /$^/,
        cwe: CWE_ID.CODE_INJECTION,
        owasp: [OWASP_CATEGORY.INTEGRITY_FAILURES, OWASP_CATEGORY.VULNERABLE_COMPONENTS],
        stride: [STRIDE_CATEGORY.TAMPERING],
        status: FINDING_STATUS.CODE_SUPPORTED,
        scenario: "A downloaded script is executed by a shell. The build then trusts whatever that URL returns at install time.",
        mitigation: "Pin an installer by digest, or vendor a reviewed script. Do not pipe a remote response into a shell.",
        remediationDiff: "- remote installer piped into a shell\n+ download a pinned artifact and verify its digest before running it",
        confidence: 0.9,
      },
      path,
      matchLine,
      knownNodeIds,
      commitSha,
    ),
  ];
}

function missingAuthFinding(
  path: string,
  lineNumber: number,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding {
  return toFinding(
    {
      id: DETECTOR_RULE.MISSING_AUTH,
      title: "HTTP route has no authentication check nearby",
      pattern: /$^/,
      cwe: CWE_ID.MISSING_AUTHENTICATION,
      owasp: [OWASP_CATEGORY.BROKEN_ACCESS_CONTROL, OWASP_CATEGORY.AUTHENTICATION_FAILURES],
      stride: [STRIDE_CATEGORY.SPOOFING, STRIDE_CATEGORY.ELEVATION_OF_PRIVILEGE],
      status: FINDING_STATUS.PLAUSIBLE_THREAT,
      scenario: "This route registration has no authentication guard in the surrounding lines. A guard in another file would not be visible here.",
      mitigation: "Require an authentication dependency, middleware, or guard on routes that are not intentionally public.",
      remediationDiff: "- route registration with no guard\n+ route registration with an authentication middleware or dependency",
      confidence: 0.55,
    },
    path,
    lineNumber,
    knownNodeIds,
    commitSha,
  );
}

function toFinding(
  rule: LineRule,
  path: string,
  lineNumber: number,
  knownNodeIds: Set<string>,
  commitSha?: string,
): Finding {
  const moduleId = moduleNodeIdForPath(path);
  const language = isPythonPath(path)
    ? SOURCE_LANGUAGE.PYTHON
    : isGoPath(path)
      ? SOURCE_LANGUAGE.GO
      : isJavaScriptPath(path)
        ? SOURCE_LANGUAGE.JAVASCRIPT
        : undefined;
  return {
    id: `finding-${rule.id}-${path}-${lineNumber}`,
    stableKey: `${rule.id}-${path}-${lineNumber}`,
    title: rule.title,
    category: FINDING_CATEGORY.SECURITY,
    strideCategories: rule.stride,
    owaspCategories: rule.owasp,
    cweIds: [rule.cwe],
    language,
    riskDomains: [RISK_DOMAIN.CYBERSECURITY],
    status: rule.status,
    affectedNodeIds: knownNodeIds.has(moduleId) ? [moduleId] : [],
    affectedAssetSummary: path,
    commitSha,
    references: [{ path, startLine: lineNumber, endLine: lineNumber, commitSha }],
    evidence: [],
    scenario: rule.scenario,
    preconditions: ["The indexed file is part of the built or deployed system"],
    trustBoundaryCrossings: [],
    existingControls: [],
    counterevidence: [],
    confidence: rule.confidence,
    severityRationale: rule.scenario,
    likelihoodRationale: "Pattern match on one line. Confirm the value is attacker-controlled before treating it as a confirmed defect.",
    assumptions: ["Read-only pattern match. No repository code was executed."],
    openQuestions: [],
    mitigation: rule.mitigation,
    remediationDiff: rule.remediationDiff,
    relatedFindingIds: [],
    attackPathIds: [],
  };
}

function lineOf(content: string, pattern: RegExp): number | undefined {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index] ?? "")) {
      pattern.lastIndex = 0;
      return index + 1;
    }
    pattern.lastIndex = 0;
  }
  return undefined;
}
