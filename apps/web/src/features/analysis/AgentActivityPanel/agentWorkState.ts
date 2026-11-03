import { AGENT_ACTIVITY_STATUS, AGENT_STEP_KIND, type AgentActivityUpdate, type AgentStepKind } from "@sentinel/analysis";
import { AUDIT_AGENT_ORDER } from "@sentinel/schema";

export const AGENT_WORK_STATUS = {
  PENDING: "pending",
  RUNNING: AGENT_ACTIVITY_STATUS.RUNNING,
  COMPLETED: AGENT_ACTIVITY_STATUS.COMPLETED,
  SKIPPED: AGENT_ACTIVITY_STATUS.SKIPPED,
  FAILED: AGENT_ACTIVITY_STATUS.FAILED,
} as const;

export type AgentWorkStatus = (typeof AGENT_WORK_STATUS)[keyof typeof AGENT_WORK_STATUS];

export interface AgentWorkStep {
  id: string;
  kind: AgentStepKind;
  text: string;
}

export interface AgentWorkItem {
  agentId: (typeof AUDIT_AGENT_ORDER)[number];
  status: AgentWorkStatus;
  steps: AgentWorkStep[];
}

export function createPendingAgentWork(): AgentWorkItem[] {
  return AUDIT_AGENT_ORDER.map((agentId) => ({
    agentId,
    status: AGENT_WORK_STATUS.PENDING,
    steps: [],
  }));
}

export function applyAgentActivity(items: AgentWorkItem[], update: AgentActivityUpdate): AgentWorkItem[] {
  return items.map((item) => applyUpdateToItem(item, update));
}

function applyUpdateToItem(item: AgentWorkItem, update: AgentActivityUpdate): AgentWorkItem {
  if (item.agentId !== update.agentId) {
    return item;
  }
  const alreadyRecorded = item.steps.some((step) => step.kind === update.kind && step.text === update.step);
  if (alreadyRecorded) {
    return { ...item, status: update.status };
  }
  return {
    ...item,
    status: update.status,
    steps: [
      ...item.steps,
      {
        id: `${item.agentId}-step-${item.steps.length}`,
        kind: update.kind,
        text: update.step,
      },
    ],
  };
}

const ROSTER_STATUS_LABEL: Record<AgentWorkStatus, string> = {
  [AGENT_WORK_STATUS.PENDING]: "Waiting",
  [AGENT_WORK_STATUS.RUNNING]: "Running",
  [AGENT_WORK_STATUS.COMPLETED]: "Done",
  [AGENT_WORK_STATUS.SKIPPED]: "Skipped",
  [AGENT_WORK_STATUS.FAILED]: "Failed",
};

export function rosterStatusLabel(status: AgentWorkStatus): string {
  return ROSTER_STATUS_LABEL[status];
}

export function isThinkingStep(step: AgentWorkStep): boolean {
  return step.kind === AGENT_STEP_KIND.THINKING;
}
