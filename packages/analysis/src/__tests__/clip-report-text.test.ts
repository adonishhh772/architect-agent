import { describe, expect, it } from "vitest";
import { compactReportText } from "../orchestrator.js";

describe("compactReportText", () => {
  it("keeps a short summary unchanged", () => {
    expect(compactReportText("Mapped 3 components. The API checks the session.")).toBe(
      "Mapped 3 components. The API checks the session.",
    );
  });

  it("keeps a sentence from the start and the end when the overview is too long", () => {
    const opening = "The frontend calls the public API.";
    const closing = "The database role is broader than the application needs.";
    const middle = Array.from({ length: 400 }, (_unused, index) => `Window ${index} notes a local check.`).join(" ");
    const summary = compactReportText(`${opening} ${middle} ${closing}`);
    expect(summary.length).toBeLessThanOrEqual(16_000);
    expect(summary).toContain("frontend calls the public API");
    expect(summary).toContain("database role is broader");
  });

  it("drops a repeated sentence instead of storing it twice", () => {
    const sentence = "The upload handler trusts the client file name.";
    const summary = compactReportText(Array.from({ length: 400 }, () => sentence).join(" "));
    expect(summary).toBe(sentence);
  });
});
