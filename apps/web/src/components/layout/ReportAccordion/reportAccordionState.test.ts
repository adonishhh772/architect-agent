import { describe, expect, it } from "vitest";
import { REPORT_SECTION, nextOpenSection } from "./reportAccordionState";

describe("nextOpenSection", () => {
  it("opens the selected section and closes the previous one", () => {
    expect(nextOpenSection(REPORT_SECTION.MAP, REPORT_SECTION.FINDINGS)).toBe(REPORT_SECTION.FINDINGS);
  });

  it("closes the section when it is selected again", () => {
    expect(nextOpenSection(REPORT_SECTION.MAP, REPORT_SECTION.MAP)).toBe("");
  });
});
