const GITHUB_USER_AGENT = "Architecture-Sentinel/1.0";

export function getGitHubApiHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": GITHUB_USER_AGENT,
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
}

export async function buildGitHubApiErrorMessage(
  response: Response,
  operationLabel: string,
): Promise<string> {
  let apiMessage = "";
  try {
    const body = (await response.clone().json()) as GitHubErrorBody;
    apiMessage = body.message?.trim() ?? "";
  } catch {
    apiMessage = "";
  }

  const status = response.status;
  const rateRemaining = response.headers.get("x-ratelimit-remaining");
  const rateReset = response.headers.get("x-ratelimit-reset");

  if (status === 403 && rateRemaining === "0") {
    const resetHint =
      rateReset !== null
        ? ` Resets around ${new Date(Number(rateReset) * 1000).toLocaleTimeString()}.`
        : "";
    return `GitHub API rate limit exceeded while ${operationLabel}.${resetHint} Add a personal access token (classic: repo scope) in the GitHub token field to raise limits.`;
  }

  if (status === 401) {
    return `GitHub authentication failed (401) while ${operationLabel}. Check that your token is valid and not expired.`;
  }

  if (status === 403) {
    const detail = apiMessage || "Forbidden";
    return `GitHub ${operationLabel} failed (403): ${detail}. Public repos still need a token when rate-limited; private repos require a token with repo access. Ensure the URL is owner/repo (not an org profile).`;
  }

  if (status === 404) {
    return `GitHub ${operationLabel} failed (404): repository not found or not accessible with the current token.`;
  }

  const suffix = apiMessage ? `: ${apiMessage}` : "";
  return `GitHub ${operationLabel} failed (${status})${suffix}`;
}
