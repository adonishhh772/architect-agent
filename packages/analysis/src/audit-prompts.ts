import {
  ATLAS_TECHNIQUE_LIST,
  AUDIT_AGENT,
  OWASP_CATEGORY_LIST,
  RISK_DOMAIN_LIST,
  STRIDE_CATEGORY,
} from "@sentinel/schema";

const AGENT_FOCUS: Record<(typeof AUDIT_AGENT)[keyof typeof AUDIT_AGENT], string> = {
  [AUDIT_AGENT.CARTOGRAPHER]:
    "Map services, modules, trust boundaries, data stores, external systems, AI agents, tools, and deployment units. Describe how requests and data move between them. After that map is clear, write architectureMermaid as a flowchart TD diagram of those connections. Record architecture gaps where a connection cannot be proven from indexed files.",
  [AUDIT_AGENT.STRIDE]:
    "Review spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege. Every security finding must include strideCategories.",
  [AUDIT_AGENT.OWASP]:
    "Map weaknesses to OWASP Top 10 2021 and OWASP LLM Top 10 2025 ids. Cover access control, injection, misconfiguration, authentication, and AI issues such as prompt injection, excessive agency, and unbounded consumption when the code supports them.",
  [AUDIT_AGENT.ATLAS]:
    "Map AI execution risk to MITRE ATLAS technique ids. Describe the affected component and the missing control. Do not write payloads or exploit procedures.",
  [AUDIT_AGENT.DATA]:
    "Review data risk: secrets in source, sensitive values in logs, personal data in prompts or retrieval stores, and database credentials. Tag riskDomains with data.",
  [AUDIT_AGENT.INFRASTRUCTURE]:
    "Review deployment risk visible in Docker, compose, CI, Kubernetes, Terraform, and gateway config: published ports, privileged containers, secrets in images, and public entry points without an auth control. Tag riskDomains with infrastructure.",
  [AUDIT_AGENT.CODE_READER]:
    "Read this batch of indexed source as a security engineer. Cover application code, tests that reveal trust assumptions, configuration, and infrastructure files. Record concrete weaknesses and also files that look benign.",
  [AUDIT_AGENT.PULL_REQUEST]:
    "Review the open pull request diffs for security regressions against the current architecture. Tag findings with the pull request number in the title.",
  [AUDIT_AGENT.VERIFIER]: "Check citations. This agent does not call a model.",
};

export const CODE_READER_PROMPT_LIMIT = 1_600;

const CODE_READER_SYSTEM_PROMPT =
  "Agent role: code_reader. You read one short source window and return one JSON object. threatModelOverview is one sentence. findings has at most two items. Each finding needs stableKey, title, category, scenario, mitigation, confidence, and references. Category is architecture, security, or ai_security. Cite only the path in this window. If the window shows no weakness, return an empty findings array. Do not write exploit steps.";

export function buildCodeReaderSystemPrompt(): string {
  return CODE_READER_SYSTEM_PROMPT;
}

export function buildCodeReaderUserPrompt(observations: readonly string[]): string {
  const files = clipPromptText(observations.join("\n\n"), CODE_READER_PROMPT_LIMIT) || "No file text.";
  return `Read this window only.\n\n${files}`;
}

const SPECIALIST_REPLY_RULE =
  "Return one JSON object for this file window. threatModelOverview is at most two sentences. findings has at most three items. Each finding needs stableKey, title, category, scenario, mitigation, confidence, and references. Cite only paths in the window. If the window shows no weakness, return an empty findings array. No exploit steps.";

export function buildSpecialistSystemPrompt(agentId: string): string {
  const focus = AGENT_FOCUS[agentId as keyof typeof AGENT_FOCUS] ?? AGENT_FOCUS[AUDIT_AGENT.CARTOGRAPHER];
  return `${SPECIALIST_REPLY_RULE}

Agent role: ${agentId}
${focus}
Allowed STRIDE ids: ${Object.values(STRIDE_CATEGORY).join(", ")}
Allowed OWASP ids: ${OWASP_CATEGORY_LIST.join(", ")}
Allowed ATLAS ids: ${ATLAS_TECHNIQUE_LIST.join(", ")}
Allowed risk domains: ${RISK_DOMAIN_LIST.join(", ")}`;
}

export const PROMPT_CHAR_LIMIT = {
  MEMORY: 400,
  BRIEF: 400,
  GRAPH: 500,
  MANIFEST: 400,
  OBSERVATIONS: 1_200,
  PRIOR_KEYS: 200,
  TOTAL: 4_000,
} as const;

export function clipPromptText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

export function buildSpecialistUserPrompt(input: {
  agentId: string;
  architectureBrief: string;
  graphSummary: string;
  manifest: string;
  observations: string[];
  priorFindingKeys: string[];
  memoryText?: string;
}): string {
  const instruction =
    "Return one JSON object with threatModelOverview, findings, and attackPaths. Cartographer also includes architectureBrief and architectureMermaid as flowchart TD with quoted labels. Each finding needs stableKey, title, category, scenario, mitigation, confidence, and references. Cite only paths in this batch. No exploit steps.";
  const head = [
    `Perform the ${input.agentId} audit pass on this file batch only.`,
    "",
    "Memory:",
    clipPromptText(input.memoryText || "No prior memory.", PROMPT_CHAR_LIMIT.MEMORY),
    "",
    "Architecture brief:",
    clipPromptText(input.architectureBrief || "No architecture brief yet.", PROMPT_CHAR_LIMIT.BRIEF),
    "",
    "Graph:",
    clipPromptText(input.graphSummary, PROMPT_CHAR_LIMIT.GRAPH),
    "",
    "Paths:",
    clipPromptText(input.manifest || "No indexed paths.", PROMPT_CHAR_LIMIT.MANIFEST),
    "",
    `Already reported: ${clipPromptText(input.priorFindingKeys.join(", ") || "none", PROMPT_CHAR_LIMIT.PRIOR_KEYS)}`,
    "",
    instruction,
    "",
    "Files:",
  ].join("\n");
  const roomForFiles = PROMPT_CHAR_LIMIT.TOTAL - head.length - 2;
  const fileBudget = Math.max(0, Math.min(PROMPT_CHAR_LIMIT.OBSERVATIONS, roomForFiles));
  const files = clipPromptText(input.observations.join("\n\n"), fileBudget) || "No file text.";
  return `${head}\n${files}`;
}
