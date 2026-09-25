import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const FOLDER_CHART = `flowchart TD
f0["frontend"]
f1["frontend/pages"]
f4["backend/app"]
f7["data_onboarding/domain"]
f4 -->|imports| f7
f4 -->|imports| f0`;

function installDom(): void {
  const domWindow = new Window();
  const target = globalThis as unknown as Record<string, unknown>;
  target.window = domWindow;
  target.document = domWindow.document;
  target.DOMParser = domWindow.DOMParser;
  target.XMLSerializer = domWindow.XMLSerializer;
  target.HTMLElement = domWindow.HTMLElement;
  target.SVGElement = domWindow.SVGElement;
  target.SVGSVGElement = domWindow.SVGSVGElement;
  target.Element = domWindow.Element;
  target.Node = domWindow.Node;
  target.CSSStyleSheet = domWindow.CSSStyleSheet;
  target.getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
}

describe("renderArchitectureMermaid", () => {
  it("draws the folder import chart as a mermaid svg", async () => {
    installDom();
    const { renderArchitectureMermaid } = await import("./renderArchitectureMermaid");
    const svg = await renderArchitectureMermaid(FOLDER_CHART, FOLDER_CHART);
    expect(svg).toContain("<svg");
    expect(svg).toContain("frontend");
    expect(svg).toContain("backend/app");
    expect(svg).toContain("imports");
  });
});
