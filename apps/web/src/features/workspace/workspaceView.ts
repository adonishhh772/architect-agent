export const WORKSPACE_VIEW = {
  LIST: "list",
  INSPECT: "inspect",
} as const;

export type WorkspaceViewMode = (typeof WORKSPACE_VIEW)[keyof typeof WORKSPACE_VIEW];

export const INSPECT_ANOTHER_WORKSPACE_LABEL = "Inspect another workspace";
export const BACK_TO_WORKSPACES_LABEL = "Back to workspaces";
export const DELETE_WORKSPACE_LABEL = "Delete";
export const DELETING_WORKSPACE_LABEL = "Deleting…";
export const REMOVE_INDEXED_WORKSPACE_LABEL = "Remove";
export const REMOVE_INDEXED_WORKSPACE_CONFIRM =
  "Remove the indexed repository from this workspace? Saved reports stay in the list.";
export const DELETE_WORKSPACE_BUSY_MESSAGE =
  "Finish or cancel the current inspection before deleting this workspace.";

export function deleteWorkspaceConfirmMessage(title: string): string {
  return `Delete “${title}” from this browser? This saved report will be removed.`;
}

export function shouldClearOpenWorkspace(openRunId: string | null, deletedRunId: string): boolean {
  return openRunId === deletedRunId;
}

export function nextOpenRunId(currentRunId: string | null, requestedRunId: string): string | null {
  if (currentRunId === requestedRunId) {
    return null;
  }
  return requestedRunId;
}
