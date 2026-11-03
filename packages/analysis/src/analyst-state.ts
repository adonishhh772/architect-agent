import { AnalystStateSchema, type AnalysisReport, type AnalystState } from "@sentinel/schema";

export function analystState(report: AnalysisReport): AnalystState {
  return AnalystStateSchema.parse(report.analyst ?? {});
}
export function recordAnalystChange(report: AnalysisReport, state: AnalystState, action: string, target: string, detail: string): AnalysisReport {
  const next = AnalystStateSchema.parse({
    ...state,
    events: [...state.events, {at: new Date().toISOString(), action, target, detail}].slice(-2000),
  });
  return {...report, analyst: next};
}
