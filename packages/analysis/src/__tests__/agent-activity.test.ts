import { describe, expect, it } from "vitest";
import { AUDIT_AGENT } from "@sentinel/schema";
import {
  describeEvidenceRead,
  describeFileRead,
  describeRemainingFileReads,
  describePassOutcome,
  describeThinking,
  describeToolActivity,
} from "../agent-activity.js";

describe("describeEvidenceRead", () => {
  it("names a single file", () => {
    expect(describeEvidenceRead(AUDIT_AGENT.STRIDE, ["src/auth/session.ts"])).toBe("Reading src/auth/session.ts.");
  });

  it("summarizes a long file list", () => {
    const paths = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
    expect(describeEvidenceRead(AUDIT_AGENT.OWASP, paths)).toBe("Reading 5 files: a.ts, b.ts, c.ts, d.ts, and 1 more.");
  });

  it("describes a pull request when there is no file pack", () => {
    expect(describeEvidenceRead(AUDIT_AGENT.PULL_REQUEST, [])).toBe("Reading the open pull request diff.");
  });
});

describe("describeFileRead", () => {
  it("names one file the way a live pass would", () => {
    expect(describeFileRead("backend/app/middleware/http_logging.py")).toBe(
      "Reading backend/app/middleware/http_logging.py.",
    );
  });

  it("counts the files that are not listed one by one", () => {
    expect(describeRemainingFileReads(1)).toBe("Reading 1 more file.");
    expect(describeRemainingFileReads(3)).toBe("Reading 3 more files.");
  });
});

describe("describeToolActivity", () => {
  it("includes the search query", () => {
    expect(describeToolActivity("searchCode", { query: "NEEDLE_ARCHITECTURE" })).toBe(
      "Using searchCode on NEEDLE_ARCHITECTURE.",
    );
  });

  it("omits a target when arguments are empty", () => {
    expect(describeToolActivity("listFiles", {})).toBe("Using listFiles.");
  });
});

describe("describeThinking", () => {
  it("keeps a short overview", () => {
    expect(describeThinking("  Session handling\nneeds a control.  ")).toBe("Session handling needs a control.");
  });

  it("caps a long overview", () => {
    const overview = "x".repeat(700);
    expect(describeThinking(overview).length).toBe(600);
  });
});

describe("describePassOutcome", () => {
  it("returns the detail when there are no findings", () => {
    expect(describePassOutcome(0, "Agent finished against its evidence pack.")).toBe(
      "Agent finished against its evidence pack.",
    );
  });

  it("counts findings", () => {
    expect(describePassOutcome(2, "done")).toBe("2 findings. done");
  });
});
