import { describe, expect, it } from "vitest";
import { buildEvidenceCorpus, rankSecurityRelevantPaths } from "../evidence-corpus.js";
import { buildRepositoryStore } from "@sentinel/ingestion";

describe("rankSecurityRelevantPaths", () => {
  it("ranks auth and api paths above generic components", () => {
    const ordered = rankSecurityRelevantPaths([
      "frontend/src/components/Button.tsx",
      "backend/src/auth/jwt.guard.ts",
      "backend/src/api/users.controller.ts",
    ]);
    expect(ordered[0]).toContain("auth");
    expect(ordered[1]).toContain("api");
  });
});

describe("buildEvidenceCorpus", () => {
  it("includes manifest for all indexed paths and bounded snippets", () => {
    const store = buildRepositoryStore(
      [
        { path: "src/auth.ts", content: "export function login() {}" },
        { path: "src/ui.tsx", content: "export function Ui() {}" },
      ],
      { commitSha: "abc" },
    );
    const corpus = buildEvidenceCorpus(store, { maxFiles: 10, maxTotalChars: 50_000 });
    expect(corpus.totalIndexedFiles).toBe(2);
    expect(corpus.filesSampled).toBeGreaterThan(0);
    expect(corpus.fileManifest).toContain("src/auth.ts");
    expect(corpus.fileManifest).toContain("src/ui.tsx");
  });
});
