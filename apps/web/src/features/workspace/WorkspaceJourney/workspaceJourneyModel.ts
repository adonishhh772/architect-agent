export const WORKSPACE_STEP = {
  PREPARE: "prepare",
  INDEX: "index",
  MODEL: "model",
  REPORT: "report",
} as const;

export const WORKSPACE_STEP_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETE: "complete",
} as const;

export type WorkspaceStepStatus = (typeof WORKSPACE_STEP_STATUS)[keyof typeof WORKSPACE_STEP_STATUS];

export interface WorkspaceJourneyStep {
  id: (typeof WORKSPACE_STEP)[keyof typeof WORKSPACE_STEP];
  label: string;
  description: string;
  status: WorkspaceStepStatus;
}

export interface WorkspaceJourneyInput {
  vaultReady: boolean;
  sourceIndexed: boolean;
  analysisRunning: boolean;
  reportReady: boolean;
}

export interface WorkspaceJourney {
  steps: WorkspaceJourneyStep[];
  nextAction: string;
}

const NEXT_ACTION = {
  PREPARE: "Unlock the vault, save a model key, test the connection, and confirm transmission.",
  INDEX: "Index a GitHub repository, upload a ZIP, or load the demo fixture.",
  MODEL: "Run the threat model. The cartographer maps the architecture before the other agents review it.",
  RUNNING: "The agents are working. The architecture map opens when the run finishes.",
  REPORT: "Start with the architecture map, then open one section at a time.",
} as const;

export function buildWorkspaceJourney(input: WorkspaceJourneyInput): WorkspaceJourney {
  const prepareComplete = input.vaultReady;
  const indexComplete = input.sourceIndexed;
  const reportComplete = input.reportReady;
  const activeId = resolveActiveStep(input);

  const steps: WorkspaceJourneyStep[] = [
    {
      id: WORKSPACE_STEP.PREPARE,
      label: "Prepare",
      description: "Vault, model, and consent",
      status: statusFor(WORKSPACE_STEP.PREPARE, prepareComplete, activeId),
    },
    {
      id: WORKSPACE_STEP.INDEX,
      label: "Index",
      description: "Pin the source snapshot",
      status: statusFor(WORKSPACE_STEP.INDEX, indexComplete, activeId),
    },
    {
      id: WORKSPACE_STEP.MODEL,
      label: "Model",
      description: "Map, then review risk",
      status: statusFor(WORKSPACE_STEP.MODEL, reportComplete, activeId),
    },
    {
      id: WORKSPACE_STEP.REPORT,
      label: "Read",
      description: "Map, findings, citations",
      status: statusFor(WORKSPACE_STEP.REPORT, reportComplete, activeId),
    },
  ];

  return {
    steps,
    nextAction: nextActionFor(input),
  };
}

function resolveActiveStep(input: WorkspaceJourneyInput): WorkspaceJourneyStep["id"] {
  if (!input.vaultReady) {
    return WORKSPACE_STEP.PREPARE;
  }
  if (!input.sourceIndexed) {
    return WORKSPACE_STEP.INDEX;
  }
  if (input.analysisRunning || !input.reportReady) {
    return WORKSPACE_STEP.MODEL;
  }
  return WORKSPACE_STEP.REPORT;
}

function statusFor(
  stepId: WorkspaceJourneyStep["id"],
  complete: boolean,
  activeId: WorkspaceJourneyStep["id"],
): WorkspaceStepStatus {
  if (stepId === activeId && !complete) {
    return WORKSPACE_STEP_STATUS.ACTIVE;
  }
  if (complete) {
    return WORKSPACE_STEP_STATUS.COMPLETE;
  }
  if (stepId === activeId) {
    return WORKSPACE_STEP_STATUS.ACTIVE;
  }
  return WORKSPACE_STEP_STATUS.PENDING;
}

function nextActionFor(input: WorkspaceJourneyInput): string {
  if (!input.vaultReady) {
    return NEXT_ACTION.PREPARE;
  }
  if (!input.sourceIndexed) {
    return NEXT_ACTION.INDEX;
  }
  if (input.analysisRunning) {
    return NEXT_ACTION.RUNNING;
  }
  if (!input.reportReady) {
    return NEXT_ACTION.MODEL;
  }
  return NEXT_ACTION.REPORT;
}
