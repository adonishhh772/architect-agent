import { z } from "zod";
import { buildGitHubApiErrorMessage, getGitHubApiHeaders } from "./github-api-errors.js";
import type { GitHubRepoRef } from "./github-url.js";
import { extractZipSafely } from "./zip-safety.js";

export interface GitHubFileBlob {
  path: string;
  content: string;
  sha: string;
  size: number;
}

export interface GitHubFetchResult {
  ref: GitHubRepoRef;
  commitSha: string;
  defaultBranch: string;
  files: GitHubFileBlob[];
  truncated: boolean;
  rateLimitRemaining?: number;
}

export interface GitHubFetchOptions {
  token?: string;
  maxFiles?: number;
  signal?: AbortSignal;
  onProgress?: (message: string, completed: number, total: number) => void;
  /** When set, routes API calls through a same-origin proxy (required for browser dev). */
  apiBaseUrl?: string;
  /** When set to a relative path, archive downloads use a same-origin proxy. */
  codeloadBaseUrl?: string;
  runtime?: "browser" | "node";
}

const DEFAULT_GITHUB_API = "https://api.github.com";
const DEFAULT_CODELOAD = "https://codeload.github.com";
const LOCAL_GITHUB_API_PROXY = "/__sentinel/github/api";
const LOCAL_CODELOAD_PROXY = "/__sentinel/github/codeload";

function isBrowserRuntime(options: GitHubFetchOptions): boolean {
  if (options.runtime === "node") {
    return false;
  }
  if (options.runtime === "browser") {
    return true;
  }
  return typeof globalThis.window !== "undefined";
}

function isLocalDevHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function normalizeGitHubFetchOptions(options: GitHubFetchOptions): GitHubFetchOptions {
  if (!isBrowserRuntime(options)) {
    return options;
  }
  const hostname = globalThis.window?.location.hostname ?? "";
  if (!isLocalDevHostname(hostname)) {
    return { ...options, runtime: "browser" };
  }
  return {
    ...options,
    runtime: "browser",
    apiBaseUrl: options.apiBaseUrl ?? LOCAL_GITHUB_API_PROXY,
    codeloadBaseUrl: options.codeloadBaseUrl ?? LOCAL_CODELOAD_PROXY,
  };
}

function resolveGitHubApiBase(options: GitHubFetchOptions): string {
  return options.apiBaseUrl ?? DEFAULT_GITHUB_API;
}

function resolveCodeloadBase(options: GitHubFetchOptions): string {
  return options.codeloadBaseUrl ?? DEFAULT_CODELOAD;
}

function canUseBrowserArchiveDownload(options: GitHubFetchOptions): boolean {
  if (!isBrowserRuntime(options)) {
    return true;
  }
  return resolveCodeloadBase(options).startsWith("/");
}

function wrapGitHubNetworkError(error: unknown, context: string): Error {
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    return new Error(
      `${context}: browser blocked the GitHub request (CORS). Use the local dev server proxy, add a GitHub token, or upload a ZIP export instead.`,
    );
  }
  return error instanceof Error ? error : new Error(context);
}

async function githubFetch(
  path: string,
  options: GitHubFetchOptions,
): Promise<Response> {
  try {
    return await fetch(`${resolveGitHubApiBase(options)}${path}`, {
      headers: getGitHubApiHeaders(options.token),
      signal: options.signal,
    });
  } catch (error) {
    throw wrapGitHubNetworkError(error, "GitHub API request failed");
  }
}

async function assertGitHubOk(response: Response, operationLabel: string): Promise<void> {
  if (!response.ok) {
    throw new Error(await buildGitHubApiErrorMessage(response, operationLabel));
  }
}

export function stripGitHubArchiveRootPrefix(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    return normalized;
  }
  return normalized.slice(slashIndex + 1);
}

function uniqueRefCandidates(repoRef: GitHubRepoRef): string[] {
  const candidates = [repoRef.ref, "main", "master"].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return [...new Set(candidates)];
}

export async function fetchGitHubRepositoryViaArchive(
  repoRef: GitHubRepoRef,
  options: GitHubFetchOptions = {},
): Promise<GitHubFetchResult> {
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const maxFiles = resolvedOptions.maxFiles ?? 1500;
  const refsToTry = uniqueRefCandidates(repoRef);
  let lastError = "Archive download failed";

  for (const ref of refsToTry) {
    if (resolvedOptions.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const codeloadBase = resolveCodeloadBase(resolvedOptions).replace(/\/+$/, "");
    const archiveUrl = `${codeloadBase}/${repoRef.owner}/${repoRef.name}/zip/refs/heads/${encodeURIComponent(ref)}`;
    resolvedOptions.onProgress?.(`Downloading archive (${ref})`, 0, 1);
    const archiveHeaders: Record<string, string> = {};
    if (resolvedOptions.token?.trim()) {
      archiveHeaders.Authorization = `Bearer ${resolvedOptions.token.trim()}`;
    }
    let response: Response;
    try {
      response = await fetch(archiveUrl, {
        headers: archiveHeaders,
        signal: resolvedOptions.signal,
      });
    } catch (error) {
      throw wrapGitHubNetworkError(error, `GitHub archive download (${ref}) failed`);
    }
    if (!response.ok) {
      lastError = await buildGitHubApiErrorMessage(response, `archive download (${ref})`);
      continue;
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    const entries = extractZipSafely(buffer);
    const files: GitHubFileBlob[] = entries
      .map((entry) => ({
        path: stripGitHubArchiveRootPrefix(entry.path),
        content: entry.content,
        sha: "archive",
        size: entry.content.length,
      }))
      .filter((entry) => entry.path.length > 0)
      .slice(0, maxFiles);

    return {
      ref: { ...repoRef, ref },
      commitSha: `archive-${ref}`,
      defaultBranch: ref,
      files,
      truncated: entries.length > maxFiles,
    };
  }

  throw new Error(
    `${lastError} Tried branches: ${refsToTry.join(", ")}. Add a GitHub token for private repos or use ZIP upload.`,
  );
}

export async function fetchPublicGitHubRepository(
  repoRef: GitHubRepoRef,
  options: GitHubFetchOptions = {},
): Promise<GitHubFetchResult> {
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const maxFiles = resolvedOptions.maxFiles ?? 1500;
  const repoResponse = await githubFetch(`/repos/${repoRef.owner}/${repoRef.name}`, resolvedOptions);
  await assertGitHubOk(repoResponse, "repository metadata");
  const repoMeta = (await repoResponse.json()) as {
    default_branch: string;
  };

  const ref = repoRef.ref ?? repoMeta.default_branch;
  const commitResponse = await githubFetch(
    `/repos/${repoRef.owner}/${repoRef.name}/commits/${encodeURIComponent(ref)}`,
    resolvedOptions,
  );
  await assertGitHubOk(commitResponse, "commit resolution");
  const commit = (await commitResponse.json()) as { sha: string };

  const treeResponse = await githubFetch(
    `/repos/${repoRef.owner}/${repoRef.name}/git/trees/${commit.sha}?recursive=1`,
    resolvedOptions,
  );
  await assertGitHubOk(treeResponse, "tree fetch");
  const tree = (await treeResponse.json()) as {
    truncated: boolean;
    tree: Array<{ path: string; type: string; sha: string; size?: number }>;
  };

  const blobs = tree.tree.filter((entry) => entry.type === "blob").slice(0, maxFiles);
  const files: GitHubFileBlob[] = [];
  let completed = 0;

  for (const entry of blobs) {
    if (resolvedOptions.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    completed += 1;
    resolvedOptions.onProgress?.("Fetching file contents", completed, blobs.length);

    const contentResponse = await githubFetch(
      `/repos/${repoRef.owner}/${repoRef.name}/contents/${entry.path}?ref=${commit.sha}`,
      resolvedOptions,
    );
    if (!contentResponse.ok) {
      continue;
    }
    const payload = (await contentResponse.json()) as {
      content?: string;
      encoding?: string;
      sha?: string;
      size?: number;
    };
    if (payload.encoding !== "base64" || !payload.content) {
      continue;
    }
    const binary = Uint8Array.from(atob(payload.content.replace(/\n/g, "")), (char) =>
      char.charCodeAt(0),
    );
    const text = new TextDecoder("utf-8", { fatal: false }).decode(binary);
    if (text.includes("\u0000")) {
      continue;
    }
    files.push({
      path: entry.path,
      content: text,
      sha: payload.sha ?? entry.sha,
      size: payload.size ?? entry.size ?? text.length,
    });
  }

  return {
    ref: { ...repoRef, ref },
    commitSha: commit.sha,
    defaultBranch: repoMeta.default_branch,
    files,
    truncated: tree.truncated || tree.tree.length > maxFiles,
  };
}

export async function fetchGitHubRepository(
  repoRef: GitHubRepoRef,
  options: GitHubFetchOptions = {},
): Promise<GitHubFetchResult> {
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const hasToken = Boolean(resolvedOptions.token?.trim());
  const archiveAllowed = canUseBrowserArchiveDownload(resolvedOptions);

  if (hasToken) {
    try {
      return await fetchPublicGitHubRepository(repoRef, resolvedOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (archiveAllowed && (message.includes("rate limit") || message.includes("(403)"))) {
        return fetchGitHubRepositoryViaArchive(repoRef, resolvedOptions);
      }
      throw error;
    }
  }

  if (archiveAllowed) {
    return fetchGitHubRepositoryViaArchive(repoRef, resolvedOptions);
  }

  try {
    return await fetchPublicGitHubRepository(repoRef, resolvedOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub ingestion failed";
    throw new Error(
      `${message} Browser mode requires a GitHub personal access token (repo scope) or a ZIP upload — direct archive download is blocked by CORS on static hosting.`,
    );
  }
}

const PULL_REQUEST_LIMITS = {
  MAX_PULL_REQUESTS: 10,
  MAX_FILES_PER_PULL_REQUEST: 20,
  MAX_PATCH_CHARS: 3_500,
} as const;

const PullRequestListItemSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  html_url: z.string().url().optional(),
});

const PullRequestFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  patch: z.string().optional(),
});

export interface PullRequestFileChange {
  filename: string;
  status: string;
  patch?: string;
}

export interface PullRequestSnapshot {
  number: number;
  title: string;
  state: string;
  htmlUrl?: string;
  files: PullRequestFileChange[];
}

export function clipPullRequestPatch(patch: string | undefined): string | undefined {
  if (!patch) {
    return undefined;
  }
  return patch.slice(0, PULL_REQUEST_LIMITS.MAX_PATCH_CHARS);
}

export async function fetchOpenPullRequests(
  repoRef: GitHubRepoRef,
  options: GitHubFetchOptions = {},
): Promise<PullRequestSnapshot[]> {
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const listResponse = await githubFetch(
    `/repos/${repoRef.owner}/${repoRef.name}/pulls?state=open&per_page=${PULL_REQUEST_LIMITS.MAX_PULL_REQUESTS}&sort=updated`,
    resolvedOptions,
  );
  await assertGitHubOk(listResponse, "open pull requests");
  const listPayload: unknown = await listResponse.json();
  const listParsed = z.array(PullRequestListItemSchema).safeParse(listPayload);
  if (!listParsed.success) {
    return [];
  }

  const snapshots: PullRequestSnapshot[] = [];
  for (const pullRequest of listParsed.data.slice(0, PULL_REQUEST_LIMITS.MAX_PULL_REQUESTS)) {
    if (resolvedOptions.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const filesResponse = await githubFetch(
      `/repos/${repoRef.owner}/${repoRef.name}/pulls/${pullRequest.number}/files?per_page=${PULL_REQUEST_LIMITS.MAX_FILES_PER_PULL_REQUEST}`,
      resolvedOptions,
    );
    if (!filesResponse.ok) {
      snapshots.push({
        number: pullRequest.number,
        title: pullRequest.title,
        state: pullRequest.state,
        htmlUrl: pullRequest.html_url,
        files: [],
      });
      continue;
    }
    const filesPayload: unknown = await filesResponse.json();
    const filesParsed = z.array(PullRequestFileSchema).safeParse(filesPayload);
    const files = filesParsed.success
      ? filesParsed.data.slice(0, PULL_REQUEST_LIMITS.MAX_FILES_PER_PULL_REQUEST).map((file) => ({
          filename: file.filename,
          status: file.status,
          patch: clipPullRequestPatch(file.patch),
        }))
      : [];
    snapshots.push({
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      htmlUrl: pullRequest.html_url,
      files,
    });
  }
  return snapshots;
}

export async function postPullRequestComment(
  repoRef: GitHubRepoRef,
  pullRequestNumber: number,
  body: string,
  options: GitHubFetchOptions = {},
): Promise<void> {
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
    throw new Error("Pull request number must be a positive integer");
  }
  if (!body.trim()) {
    throw new Error("Pull request review comment is empty");
  }
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const response = await fetch(
    `${resolveGitHubApiBase(resolvedOptions)}/repos/${repoRef.owner}/${repoRef.name}/issues/${pullRequestNumber}/comments`,
    {
      method: "POST",
      headers: {
        ...getGitHubApiHeaders(resolvedOptions.token),
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: body.slice(0, 16000) }),
      signal: resolvedOptions.signal,
    },
  );
  await assertGitHubOk(response, "pull request comment");
}

export interface PullRequestReviewCommentInput {
  path: string;
  line: number;
  body: string;
}

export async function fetchPullRequestFileNames(
  repoRef: GitHubRepoRef,
  pullRequestNumber: number,
  options: GitHubFetchOptions = {},
): Promise<string[]> {
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const response = await fetch(
    `${resolveGitHubApiBase(resolvedOptions)}/repos/${repoRef.owner}/${repoRef.name}/pulls/${pullRequestNumber}/files?per_page=100`,
    {
      headers: getGitHubApiHeaders(resolvedOptions.token),
      signal: resolvedOptions.signal,
    },
  );
  await assertGitHubOk(response, "pull request files");
  const payload: unknown = await response.json();
  const parsed = z.array(PullRequestFileSchema).safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((file) => file.filename);
}

export async function postPullRequestReview(
  repoRef: GitHubRepoRef,
  pullRequestNumber: number,
  commitSha: string,
  body: string,
  comments: PullRequestReviewCommentInput[],
  options: GitHubFetchOptions = {},
): Promise<void> {
  if (!commitSha.trim() || comments.length === 0) {
    await postPullRequestComment(repoRef, pullRequestNumber, body, options);
    return;
  }
  const resolvedOptions = normalizeGitHubFetchOptions(options);
  const response = await fetch(
    `${resolveGitHubApiBase(resolvedOptions)}/repos/${repoRef.owner}/${repoRef.name}/pulls/${pullRequestNumber}/reviews`,
    {
      method: "POST",
      headers: {
        ...getGitHubApiHeaders(resolvedOptions.token),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        commit_id: commitSha,
        body: body.slice(0, 16000),
        event: "COMMENT",
        comments: comments.slice(0, 20).map((comment) => ({
          path: comment.path,
          line: comment.line,
          side: "RIGHT",
          body: comment.body,
        })),
      }),
      signal: resolvedOptions.signal,
    },
  );
  if (!response.ok) {
    await postPullRequestComment(repoRef, pullRequestNumber, body, options);
    return;
  }
}
