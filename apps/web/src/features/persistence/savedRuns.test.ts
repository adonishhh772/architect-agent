import { describe, expect, it } from "vitest";
import { sortSavedRunsNewestFirst, type PersistedReportRecord } from "./indexedDbStore";

describe("sortSavedRunsNewestFirst", () => {
  it("orders runs from newest to oldest", () => {
    const older = runRecord("older", "2026-01-01T00:00:00.000Z");
    const newer = runRecord("newer", "2026-06-01T00:00:00.000Z");
    expect(sortSavedRunsNewestFirst([older, newer]).map((record) => record.id)).toEqual(["newer", "older"]);
  });

  it("breaks a timestamp tie by id", () => {
    const savedAt = "2026-06-01T00:00:00.000Z";
    const alpha = runRecord("a", savedAt);
    const beta = runRecord("b", savedAt);
    expect(sortSavedRunsNewestFirst([alpha, beta]).map((record) => record.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the input list", () => {
    const records = [runRecord("older", "2026-01-01T00:00:00.000Z"), runRecord("newer", "2026-06-01T00:00:00.000Z")];
    sortSavedRunsNewestFirst(records);
    expect(records.map((record) => record.id)).toEqual(["older", "newer"]);
  });
});

function runRecord(id: string, savedAt: string): PersistedReportRecord {
  return {
    id,
    savedAt,
    agentWork: [],
    report: {
      id,
    },
  } as PersistedReportRecord;
}
