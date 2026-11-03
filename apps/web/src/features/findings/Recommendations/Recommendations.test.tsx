/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Recommendations } from "./Recommendations";

const RECOMMENDATION_TITLE = "Require authentication on the ingest route";
const RECOMMENDATION_DETAIL = "The enqueue helper accepts a broker URL from the request.";
const CITED_PATH = "apps/worker/tasks.py";

let selectedPath = "";

describe("recommendation detail", () => {
  let root: Root | undefined;

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    document.body.innerHTML = "";
    selectedPath = "";
  });

  it("opens the recommendation detail without leaving the list", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <Recommendations
          recommendations={[
            {
              id: "rec-1",
              priority: 1,
              title: RECOMMENDATION_TITLE,
              description: RECOMMENDATION_DETAIL,
              relatedFindingIds: [],
              citations: [{ path: CITED_PATH, startLine: 12 }],
              omittedFileCount: 0,
              rationale: "The route is reachable without a session.",
            },
          ]}
          onSelectCitation={rememberPath}
        />,
      );
    });

    expect(container.querySelector("[data-testid='recommendation-detail-rec-1']")).toBeNull();
    expect(selectedPath).toBe("");

    const toggle = container.querySelector("[data-testid='recommendation-toggle-rec-1']");
    if (!(toggle instanceof HTMLButtonElement)) {
      throw new Error("Missing recommendation toggle");
    }
    await act(async () => {
      toggle.click();
    });

    expect(container.querySelector("[data-testid='recommendation-detail-rec-1']")?.textContent).toContain(
      RECOMMENDATION_DETAIL,
    );
    expect(selectedPath).toBe("");
  });
});

function rememberPath(path: string): void {
  selectedPath = path;
}
