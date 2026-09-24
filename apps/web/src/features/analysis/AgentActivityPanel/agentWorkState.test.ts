import { AGENT_ACTIVITY_STATUS, AGENT_STEP_KIND, type AgentActivityUpdate } from "@sentinel/analysis";
import { AUDIT_AGENT } from "@sentinel/schema";
import { describe, expect, it } from "vitest";
import { applyAgentActivity, createPendingAgentWork } from "./agentWorkState";

describe("applyAgentActivity", () => {
  it("records thinking under the active agent and leaves the others waiting", () => {
    const initial = createPendingAgentWork();
    const next = applyAgentActivity(initial, thinkingUpdate(AUDIT_AGENT.STRIDE, "Session handling needs a control."));
    const stride = next.find((item) => item.agentId === AUDIT_AGENT.STRIDE);
    const cartographer = next.find((item) => item.agentId === AUDIT_AGENT.CARTOGRAPHER);

    expect(next).toHaveLength(9);
    expect(stride?.status).toBe(AGENT_ACTIVITY_STATUS.RUNNING);
    expect(stride?.steps).toEqual([
      {
        id: "stride-step-0",
        kind: AGENT_STEP_KIND.THINKING,
        text: "Session handling needs a control.",
      },
    ]);
    expect(cartographer?.status).toBe("pending");
    expect(cartographer?.steps).toEqual([]);
  });

  it("does not append the same step twice", () => {
    const update = thinkingUpdate(AUDIT_AGENT.DATA, "Logger may write a secret.");
    const once = applyAgentActivity(createPendingAgentWork(), update);
    const twice = applyAgentActivity(once, { ...update, status: AGENT_ACTIVITY_STATUS.COMPLETED });
    const data = twice.find((item) => item.agentId === AUDIT_AGENT.DATA);

    expect(data?.steps).toHaveLength(1);
    expect(data?.status).toBe(AGENT_ACTIVITY_STATUS.COMPLETED);
  });

  it("keeps an action and a thinking step that share text", () => {
    const text = "Reading src/app.ts.";
    const withAction = applyAgentActivity(createPendingAgentWork(), {
      agentId: AUDIT_AGENT.CARTOGRAPHER,
      status: AGENT_ACTIVITY_STATUS.RUNNING,
      kind: AGENT_STEP_KIND.ACTION,
      step: text,
    });
    const withThinking = applyAgentActivity(withAction, thinkingUpdate(AUDIT_AGENT.CARTOGRAPHER, text));
    const cartographer = withThinking.find((item) => item.agentId === AUDIT_AGENT.CARTOGRAPHER);

    expect(cartographer?.steps).toHaveLength(2);
  });
});

function thinkingUpdate(agentId: string, step: string): AgentActivityUpdate {
  return {
    agentId,
    status: AGENT_ACTIVITY_STATUS.RUNNING,
    kind: AGENT_STEP_KIND.THINKING,
    step,
  };
}
