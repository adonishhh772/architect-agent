export const REPORT_SCHEMA_VERSION = "1.0.0" as const;

export const PROVENANCE_KIND = {
  OBSERVED: "observed",
  INFERRED: "inferred",
  USER_DECLARED: "user_declared",
  UNKNOWN: "unknown",
} as const;

export const FINDING_CATEGORY = {
  ARCHITECTURE: "architecture",
  SECURITY: "security",
  AI_SECURITY: "ai_security",
} as const;

export const FINDING_STATUS = {
  CODE_SUPPORTED: "code_supported_weakness",
  PLAUSIBLE_THREAT: "plausible_threat_requiring_verification",
  ARCHITECTURE_CONCERN: "architecture_concern",
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
} as const;

export const STRIDE_CATEGORY = {
  SPOOFING: "spoofing",
  TAMPERING: "tampering",
  REPUDIATION: "repudiation",
  INFORMATION_DISCLOSURE: "information_disclosure",
  DENIAL_OF_SERVICE: "denial_of_service",
  ELEVATION_OF_PRIVILEGE: "elevation_of_privilege",
} as const;

export const GRAPH_NODE_KIND = {
  ACTOR: "actor",
  APPLICATION: "application",
  SERVICE: "service",
  MODULE: "module",
  API_ENTRY: "api_entry",
  DATA_STORE: "data_store",
  QUEUE: "queue",
  WORKER: "worker",
  EXTERNAL_SYSTEM: "external_system",
  AI_MODEL: "ai_model",
  AI_AGENT: "ai_agent",
  AI_TOOL: "ai_tool",
  RETRIEVAL_STORE: "retrieval_store",
  MEMORY: "memory",
  TRUST_BOUNDARY: "trust_boundary",
} as const;

export const ANALYSIS_MODE = {
  BROWSER: "browser",
  DEEP_RUNNER: "deep_runner",
  IMPORTED: "imported",
} as const;

export const PROVIDER_ID = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
  DEEPSEEK: "deepseek",
  OPENAI_COMPATIBLE: "openai_compatible",
} as const;
