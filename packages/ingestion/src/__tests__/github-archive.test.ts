import { describe, expect, it } from "vitest";
import { stripGitHubArchiveRootPrefix } from "../github-client.js";

describe("stripGitHubArchiveRootPrefix", () => {
  it("removes the single top-level folder GitHub adds to archives", () => {
    expect(stripGitHubArchiveRootPrefix("Hello-World-master/README")).toBe("README");
    expect(stripGitHubArchiveRootPrefix("repo-main/src/app.ts")).toBe("src/app.ts");
  });
});
