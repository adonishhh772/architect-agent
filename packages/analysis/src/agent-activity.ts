import { AUDIT_AGENT } from "@sentinel/schema";

export const AGENT_ACTIVITY_STATUS = {
  RUNNING: "running",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  FAILED: "failed",
} as const;

export type AgentActivityStatus = (typeof AGENT_ACTIVITY_STATUS)[keyof typeof AGENT_ACTIVITY_STATUS];

export const AGENT_STEP_KIND = {
  ACTION: "action",
  THINKING: "thinking",
} as const;

export type AgentStepKind = (typeof AGENT_STEP_KIND)[keyof typeof AGENT_STEP_KIND];

export interface AgentActivityUpdate {
  agentId: string;
  status: AgentActivityStatus;
  kind: AgentStepKind;
  step: string;
}

export const AGENT_ACTIVITY_TEXT = {
  START: "Starting this pass.",
  CALLING_WINDOW: "Calling the model on this short window.",
  WRITING_REVIEW: "Writing this pass from the files just read.",
  FOLLOW_UP: "The model asked for more evidence before writing findings.",
  NO_FILES: "No indexed files matched this agent's scope.",
  PULL_REQUEST: "Reading the open pull request diff.",
  VERIFY_START: "Checking each citation against the indexed snapshot.",
} as const;

const FILE_PREVIEW_LIMIT = 4;
export const LIVE_FILE_READ_LIMIT = 12;
const TOOL_TARGET_LIMIT = 80;
const THINKING_LIMIT = 600;

const TOOL_TARGET_KEYS = ["path", "query", "symbol", "nodeId", "filename", "prefix", "pathContains"] as const;

export function describeEvidenceRead(agentId: string, paths: string[]): string {
  if (agentId === AUDIT_AGENT.PULL_REQUEST) {
    return AGENT_ACTIVITY_TEXT.PULL_REQUEST;
  }
  if (paths.length === 0) {
    return AGENT_ACTIVITY_TEXT.NO_FILES;
  }
  const preview = paths.slice(0, FILE_PREVIEW_LIMIT);
  const hiddenCount = paths.length - preview.length;
  const names = preview.join(", ");
  if (paths.length === 1) {
    return `Reading ${names}.`;
  }
  if (hiddenCount === 0) {
    return `Reading ${paths.length} files: ${names}.`;
  }
  return `Reading ${paths.length} files: ${names}, and ${hiddenCount} more.`;
}

export function describeFileRead(path: string): string {
  return `Reading ${path}.`;
}

export function describeRemainingFileReads(hiddenCount: number): string {
  if (hiddenCount === 1) {
    return "Reading 1 more file.";
  }
  return `Reading ${hiddenCount} more files.`;
}

export function describeReviewRound(roundNumber: number): string {
  return `Reviewing the indexed evidence, round ${roundNumber}.`;
}

export function describeToolActivity(tool: string, args: Record<string, unknown> | undefined): string {
  const target = readToolTarget(args);
  if (!target) {
    return `Using ${tool}.`;
  }
  return `Using ${tool} on ${target}.`;
}

export function describeThinking(overview: string): string {
  const compact = overview.replace(/\s+/g, " ").trim();
  if (compact.length <= THINKING_LIMIT) {
    return compact;
  }
  return `${compact.slice(0, THINKING_LIMIT - 1)}…`;
}

export function describePassOutcome(findingCount: number, detail: string): string {
  if (findingCount <= 0) {
    return detail;
  }
  const findingLabel = findingCount === 1 ? "1 finding" : `${findingCount} findings`;
  return `${findingLabel}. ${detail}`;
}

function readToolTarget(args: Record<string, unknown> | undefined): string | null {
  if (!args) {
    return null;
  }
  for (const key of TOOL_TARGET_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (trimmed.length <= TOOL_TARGET_LIMIT) {
        return trimmed;
      }
      return `${trimmed.slice(0, TOOL_TARGET_LIMIT - 1)}…`;
    }
  }
  return null;
}
