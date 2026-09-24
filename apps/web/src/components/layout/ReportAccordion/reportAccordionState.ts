export const REPORT_SECTION = {
  MAP: "architecture-map",
  OVERVIEW: "repository-overview",
  STRIDE: "stride",
  FRAMEWORK: "framework",
  PULL_REQUEST: "pull-request",
  FINDINGS: "findings",
  RECOMMENDATIONS: "recommendations",
  COPILOT: "copilot",
  COVERAGE: "coverage",
} as const;

export function nextOpenSection(currentSectionId: string, selectedSectionId: string): string {
  if (currentSectionId === selectedSectionId) {
    return "";
  }
  return selectedSectionId;
}
