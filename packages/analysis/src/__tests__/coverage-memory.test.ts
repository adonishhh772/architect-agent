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
  it("continues a long file until every line has been sent", () => {
    const lines = Array.from({ length: 40 }, (_unused, index) => `line ${index + 1} ${"x".repeat(80)}`);
    const context = {
      contents: new Map([["src/long.ts", lines.join("\n")]]),
      graph: { nodes: [], edges: [] },
    };
    let reconstructed = "";
    let resumeLines: Record<string, number> = {};
    let resumeColumns: Record<string, number> = {};
    let finished = false;
    for (let step = 0; step < 30 && !finished; step += 1) {
      const continued = (resumeColumns["src/long.ts"] ?? 0) > 0;
      const window = readFileWindows(context, ["src/long.ts"], resumeLines, resumeColumns);
      const source = sourceFromObservation(window.observations[0]?.text ?? "");
      reconstructed = continued ? `${reconstructed}${source}` : `${reconstructed}${reconstructed.length > 0 ? "\n" : ""}${source}`;
      resumeLines = window.resumeLines;
      resumeColumns = window.resumeColumns;
      finished = window.finishedPaths.includes("src/long.ts");
    }
    expect(finished).toBe(true);
    expect(reconstructed).toBe(lines.join("\n"));
  });
});

function sourceFromObservation(text: string): string {
  const inner = text.replace("[UNTRUSTED_REPOSITORY_DATA_BEGIN]\n", "").replace("\n[UNTRUSTED_REPOSITORY_DATA_END]", "");
  const newline = inner.indexOf("\n");
  return newline === -1 ? "" : inner.slice(newline + 1);
}

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
