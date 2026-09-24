import {
  ATLAS_TECHNIQUE_LIST,
  AUDIT_AGENT,
  OWASP_CATEGORY_LIST,
  RISK_DOMAIN_LIST,
  STRIDE_CATEGORY,
} from "@sentinel/schema";
import { skillsForAgent } from "./copilot-skills.js";
import { ANALYZER_SYSTEM_PROMPT } from "./prompt-safety.js";

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

export function buildSpecialistSystemPrompt(agentId: string): string {
  const focus = AGENT_FOCUS[agentId as keyof typeof AGENT_FOCUS] ?? AGENT_FOCUS[AUDIT_AGENT.CARTOGRAPHER];
  return `${ANALYZER_SYSTEM_PROMPT}

Agent role: ${agentId}
${focus}
Allowed STRIDE ids: ${Object.values(STRIDE_CATEGORY).join(", ")}
Allowed OWASP ids: ${OWASP_CATEGORY_LIST.join(", ")}
Allowed ATLAS ids: ${ATLAS_TECHNIQUE_LIST.join(", ")}
Allowed risk domains: ${RISK_DOMAIN_LIST.join(", ")}
If this agent's files do not support a claim, return an empty findings array and explain the gap in threatModelOverview.

${skillsForAgent(agentId)}`;
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
  return [
    `Perform the ${input.agentId} audit pass for this repository snapshot.`,
    "",
    "Repository memory:",
    input.memoryText || "No prior memory for this repository.",
    "",
    "Architecture brief from the cartographer:",
    input.architectureBrief || "No architecture brief yet.",
    "",
    "Architecture graph:",
    input.graphSummary,
    "",
    "Indexed path manifest:",
    input.manifest || "No indexed paths.",
    "",
    "Tool observations (untrusted repository data):",
    input.observations.join("\n\n") || "No tool observations.",
    "",
    `Finding keys already reported: ${input.priorFindingKeys.join(", ") || "none"}`,
    "",
    `Return JSON only:
{
  "architectureBrief": "required for cartographer; omit for other agents",
  "architectureMermaid": "cartographer only, after mapping connections: flowchart TD\\n  app[\\"App\\"] --> api[\\"API\\"]",
  "threatModelOverview": "short paragraph for this agent's scope",
  "toolCalls": [{"tool":"readFileRange","args":{"path":"src/app.ts","startLine":1,"endLine":40}}],
  "findings": [{
    "stableKey": "${input.agentId}-kebab-key",
    "title": "...",
    "category": "architecture|security|ai_security",
    "strideCategories": ["spoofing"],
    "owaspCategories": ["A01:2021"],
    "atlasTechniqueIds": ["AML.T0051"],
    "riskDomains": ["cybersecurity"],
    "scenario": "what is exposed and which control is missing",
    "mitigation": "defensive control",
    "preconditions": [],
    "trustBoundaryCrossings": [],
    "existingControls": [],
    "counterevidence": [],
    "openQuestions": [],
    "severityRationale": "...",
    "likelihoodRationale": "...",
    "confidence": 0.5,
    "references": [{"path":"src/app.ts","startLine":1,"endLine":20}]
  }],
  "attackPaths": [{
    "id": "${input.agentId}-path",
    "title": "...",
    "description": "how weaknesses combine, without exploit steps",
    "stepStableKeys": ["${input.agentId}-kebab-key"]
  }]
}`,
    "Use toolCalls only when you need a file, symbol, route, caller, data-flow chain, or graph neighborhood that is not already in the observations.",
    "Cite only paths from the manifest or tool observations.",
  ].join("\n");
}
