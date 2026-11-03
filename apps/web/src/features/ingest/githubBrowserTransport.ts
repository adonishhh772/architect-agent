import type { GitHubFetchOptions } from "@sentinel/ingestion";

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function getBrowserGitHubFetchOptions(): Pick<
  GitHubFetchOptions,
  "runtime" | "apiBaseUrl" | "codeloadBaseUrl"
> {
  if (import.meta.env.DEV || isLocalDevHost()) {
    return {
      runtime: "browser",
      apiBaseUrl: "/__sentinel/github/api",
      codeloadBaseUrl: "/__sentinel/github/codeload",
    };
  }
  return {
    runtime: "browser",
    apiBaseUrl: "https://api.github.com",
  };
}
