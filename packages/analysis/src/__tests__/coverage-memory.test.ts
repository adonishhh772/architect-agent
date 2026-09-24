import { describe, expect, it } from "vitest";
import { AUDIT_AGENT, COPILOT_SKILL } from "@sentinel/schema";
import { buildAuditMemory, formatMemoryForPrompt } from "../audit-memory.js";
import { selectUnreadBatch } from "../coverage-queue.js";
import { describeUnopenedFiles, readFileWindows } from "../evidence-packs.js";
import { COPILOT_SKILLS, skillsForAgent } from "../copilot-skills.js";

describe("selectUnreadBatch", () => {
  it("reads security-relevant files first and then the rest of the snapshot", () => {
    const contents = new Map<string, string>([
      ["README.md", "overview"],
      ["src/auth/session.ts", "export const session = true;\n"],
      ["src/plain.ts", "export const plain = 1;\n"],
    ]);
    const first = selectUnreadBatch([...contents.keys()], new Set(), contents, 1, 10_000);
    expect(first).toEqual(["src/auth/session.ts"]);
    const second = selectUnreadBatch([...contents.keys()], new Set(first), contents, 5, 10_000);
    expect(second.sort()).toEqual(["README.md", "src/plain.ts"]);
  });
});

describe("buildAuditMemory", () => {
  it("records unread files and omits pull request patches", () => {
    const memory = buildAuditMemory({
      repositoryKey: "acme/app",
      commitSha: "abc",
      indexedPaths: ["src/a.ts", "src/b.ts"],
      pathsRead: ["src/a.ts"],
      pathsPartial: [],
      findings: [],
      pullRequests: [
        {
          number: 7,
          title: "Add login",
          state: "open",
          files: [{ filename: "src/auth.ts", status: "modified", patch: "secret-patch" }],
        },
      ],
      updatedAt: "2026-09-23T12:00:00.000Z",
    });
    expect(memory.filesUnread).toEqual(["src/b.ts"]);
    const finished = buildAuditMemory({
      repositoryKey: "acme/app",
      indexedPaths: ["src/long.ts"],
      pathsRead: ["src/long.ts"],
      pathsPartial: ["src/long.ts"],
      findings: [],
      pullRequests: [],
      updatedAt: "2026-09-23T12:00:00.000Z",
    });
    expect(finished.filesPartial).toEqual([]);
    expect(memory.pullRequestsReviewed[0]?.filenames).toEqual(["src/auth.ts"]);
    expect(JSON.stringify(memory)).not.toContain("secret-patch");
    expect(formatMemoryForPrompt(memory)).toContain("Unread last time: 1");
  });
});

describe("readFileWindows", () => {
  it("continues a long file after the first window", () => {
    const lines = Array.from({ length: 300 }, (_unused, index) => `line ${index + 1}`);
    const context = {
      contents: new Map([["src/long.ts", lines.join("\n")]]),
      graph: { nodes: [], edges: [] },
    };
    const first = readFileWindows(context, ["src/long.ts"], {});
    expect(first.partialPaths).toEqual(["src/long.ts"]);
    expect(first.resumeLines["src/long.ts"]).toBe(221);
    expect(first.finishedPaths).toEqual([]);
    const second = readFileWindows(context, ["src/long.ts"], first.resumeLines);
    expect(second.finishedPaths).toEqual(["src/long.ts"]);
    expect(second.partialPaths).toEqual([]);
    expect(second.resumeLines["src/long.ts"]).toBe(0);
  });
});

describe("describeUnopenedFiles", () => {
  it("records indexed files a specialist did not open", () => {
    const detail = describeUnopenedFiles(
      ["src/auth.ts", "src/billing.ts", "src/ui.ts"],
      ["src/auth.ts"],
    );
    expect(detail).toContain("Opened 1 files");
    expect(detail).toContain("Did not open 2 indexed files");
    expect(detail).toContain("src/billing.ts");
    expect(detail).toContain("src/ui.ts");
  });
});

describe("copilot skills", () => {
  it("gives the code reader the full-repository skill and every agent the accuracy skill", () => {
    expect(skillsForAgent(AUDIT_AGENT.CODE_READER)).toContain(COPILOT_SKILLS[COPILOT_SKILL.FULL_REPOSITORY]);
    expect(skillsForAgent(AUDIT_AGENT.PULL_REQUEST)).toContain(COPILOT_SKILLS[COPILOT_SKILL.PULL_REQUEST]);
    expect(skillsForAgent(AUDIT_AGENT.STRIDE)).toContain(COPILOT_SKILLS[COPILOT_SKILL.ACCURACY]);
    expect(skillsForAgent(AUDIT_AGENT.STRIDE)).not.toContain(COPILOT_SKILLS[COPILOT_SKILL.FULL_REPOSITORY]);
  });
});
