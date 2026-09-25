/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MaterialSelect } from "./MaterialSelect";

const OPENAI_LABEL = "OpenAI";
const DEEPSEEK_LABEL = "DeepSeek";
const MEDIUM_LABEL = "Medium";

describe("MaterialSelect menu", () => {
  let root: Root | undefined;

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    document.body.innerHTML = "";
  });

  it("opens an opaque menu above the fields underneath", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MaterialSelect
          label="Provider"
          testId="provider-select"
          value="deepseek"
          options={[
            { value: "openai", label: OPENAI_LABEL },
            { value: "deepseek", label: DEEPSEEK_LABEL },
          ]}
          onChange={handleNoop}
        />,
      );
    });

    const trigger = container.querySelector("[data-testid='provider-select']");
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error("Missing provider select");
    }

    await act(async () => {
      trigger.click();
    });

    const menu = container.querySelector("[role='listbox']");
    const selectRoot = container.firstElementChild;
    expect(trigger.className).toContain("select-surface");
    expect(menu?.className).toContain("select-surface");
    expect(menu?.className).toContain("z-50");
    expect(selectRoot?.className).toContain("z-50");
    expect(menu?.textContent).toContain(OPENAI_LABEL);
    expect(menu?.textContent).toContain(DEEPSEEK_LABEL);
  });

  it("gives the closed reasoning effort box the same solid surface", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <div>
          <MaterialSelect
            label="Provider"
            testId="provider-select"
            value="deepseek"
            options={[{ value: "deepseek", label: DEEPSEEK_LABEL }]}
            onChange={handleNoop}
          />
          <MaterialSelect
            label="Reasoning effort"
            testId="reasoning-effort"
            value="medium"
            options={[{ value: "medium", label: MEDIUM_LABEL }]}
            onChange={handleNoop}
          />
        </div>,
      );
    });

    const effortTrigger = container.querySelector("[data-testid='reasoning-effort']");
    const effortRoot = effortTrigger?.parentElement;
    if (!(effortTrigger instanceof HTMLButtonElement) || !(effortRoot instanceof HTMLElement)) {
      throw new Error("Missing reasoning effort select");
    }

    expect(effortTrigger.className).toContain("select-surface");
    expect(effortTrigger.textContent).toContain(MEDIUM_LABEL);
    expect(effortRoot.className).toContain("z-0");

    const providerTrigger = container.querySelector("[data-testid='provider-select']");
    if (!(providerTrigger instanceof HTMLButtonElement)) {
      throw new Error("Missing provider select");
    }
    await act(async () => {
      providerTrigger.click();
    });

    expect(effortRoot.className).toContain("z-0");
    expect(container.querySelector("[role='listbox']")?.className).toContain("select-surface");
  });
});

function handleNoop(_value: string): void {
  return undefined;
}
