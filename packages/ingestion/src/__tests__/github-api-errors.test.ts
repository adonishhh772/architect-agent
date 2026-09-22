import { describe, expect, it } from "vitest";
import { buildGitHubApiErrorMessage, getGitHubApiHeaders } from "../github-api-errors.js";

describe("github-api-errors", () => {
  it("includes User-Agent required by GitHub API", () => {
    const headers = getGitHubApiHeaders();
    expect(headers["User-Agent"]).toContain("Architecture-Sentinel");
  });

  it("describes rate limit 403 clearly", async () => {
    const response = new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "4102444800" },
    });
    const message = await buildGitHubApiErrorMessage(response, "repository metadata");
    expect(message).toContain("rate limit");
    expect(message).toContain("personal access token");
  });

  it("describes forbidden 403 with API message", async () => {
    const response = new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), {
      status: 403,
    });
    const message = await buildGitHubApiErrorMessage(response, "repository metadata");
    expect(message).toContain("403");
    expect(message).toContain("Resource not accessible");
  });
});
