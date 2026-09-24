export const WORKSPACE_VIEW = {
  LIST: "list",
  INSPECT: "inspect",
} as const;

export type WorkspaceViewMode = (typeof WORKSPACE_VIEW)[keyof typeof WORKSPACE_VIEW];

export const INSPECT_ANOTHER_WORKSPACE_LABEL = "Inspect another workspace";
export const BACK_TO_WORKSPACES_LABEL = "Back to workspaces";

export function nextOpenRunId(currentRunId: string | null, requestedRunId: string): string | null {
  if (currentRunId === requestedRunId) {
    return null;
  }
  return requestedRunId;
}
