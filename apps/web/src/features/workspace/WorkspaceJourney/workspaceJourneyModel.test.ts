import { describe, expect, it } from "vitest";
import { WORKSPACE_STEP, WORKSPACE_STEP_STATUS, buildWorkspaceJourney } from "./workspaceJourneyModel";

describe("buildWorkspaceJourney", () => {
  it("starts on prepare when the vault is not ready", () => {
    const journey = buildWorkspaceJourney({
      vaultReady: false,
      sourceIndexed: false,
      analysisRunning: false,
      reportReady: false,
    });
    expect(journey.steps.find((step) => step.id === WORKSPACE_STEP.PREPARE)?.status).toBe(WORKSPACE_STEP_STATUS.ACTIVE);
    expect(journey.nextAction).toContain("vault");
  });

  it("moves to index after the provider is ready", () => {
    const journey = buildWorkspaceJourney({
      vaultReady: true,
      sourceIndexed: false,
      analysisRunning: false,
      reportReady: false,
    });
    expect(journey.steps.find((step) => step.id === WORKSPACE_STEP.PREPARE)?.status).toBe(WORKSPACE_STEP_STATUS.COMPLETE);
    expect(journey.steps.find((step) => step.id === WORKSPACE_STEP.INDEX)?.status).toBe(WORKSPACE_STEP_STATUS.ACTIVE);
  });

  it("keeps the model step active while agents are running", () => {
    const journey = buildWorkspaceJourney({
      vaultReady: true,
      sourceIndexed: true,
      analysisRunning: true,
      reportReady: false,
    });
    expect(journey.steps.find((step) => step.id === WORKSPACE_STEP.MODEL)?.status).toBe(WORKSPACE_STEP_STATUS.ACTIVE);
    expect(journey.nextAction).toContain("architecture map");
  });

  it("marks the report as the current step when a run is ready", () => {
    const journey = buildWorkspaceJourney({
      vaultReady: true,
      sourceIndexed: true,
      analysisRunning: false,
      reportReady: true,
    });
    expect(journey.steps.every((step) => step.status === WORKSPACE_STEP_STATUS.COMPLETE)).toBe(true);
    expect(journey.nextAction).toContain("architecture map");
  });
});
