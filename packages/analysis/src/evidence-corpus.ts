import type { RepositoryStore } from "@sentinel/ingestion";
import { sanitizeRepositorySnippetForPrompt } from "./prompt-safety.js";

const SECURITY_PATH_KEYWORDS = [
  "auth",
  "login",
  "session",
  "jwt",
  "oauth",
  "guard",
  "middleware",
  "route",
  "controller",
  "api",
  "webhook",
  "admin",
  "permission",
  "role",
  "policy",
  "security",
  "crypto",
  "secret",
  "docker",
  "compose",
  "nginx",
  "gateway",
  "prisma",
  "migration",
  "sql",
  "env",
  "config",
  "agent",
  "tool",
  "llm",
  "openai",
  "prompt",
] as const;

export function rankSecurityRelevantPaths(paths: string[]): string[] {
  const scored = paths.map((path) => {
    const lower = path.toLowerCase();
    let score = 0;
    for (const keyword of SECURITY_PATH_KEYWORDS) {
      if (lower.includes(keyword)) {
        score += 2;
      }
    }
    if (/\.(ts|tsx|py|html?|ya?ml|sql|sh|bash)$/.test(lower)) {
      score += 1;
    }
    if (lower.includes("test") || lower.includes("__mocks__")) {
      score -= 1;
    }
    return { path, score };
  });
  return scored
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((entry) => entry.path);
}

export interface EvidenceCorpusResult {
  fileManifest: string;
  snippets: string[];
  filesSampled: number;
  totalIndexedFiles: number;
}

export function buildEvidenceCorpus(
  store: RepositoryStore,
  options: { maxFiles?: number; maxCharsPerFile?: number; maxTotalChars?: number } = {},
): EvidenceCorpusResult {
  const maxFiles = options.maxFiles ?? 80;
  const maxCharsPerFile = options.maxCharsPerFile ?? 4_000;
  const maxTotalChars = options.maxTotalChars ?? 180_000;

  const allPaths = [...store.contents.keys()];
  const orderedPaths = rankSecurityRelevantPaths(allPaths);
  const selectedPaths = orderedPaths.slice(0, maxFiles);

  const snippets: string[] = [];
  let totalChars = 0;

  for (const path of selectedPaths) {
    const raw = store.contents.get(path);
    if (!raw) {
      continue;
    }
    const slice = raw.slice(0, maxCharsPerFile);
    const snippet = sanitizeRepositorySnippetForPrompt(`${path}:\n${slice}`);
    if (totalChars + snippet.length > maxTotalChars) {
      break;
    }
    snippets.push(snippet);
    totalChars += snippet.length;
  }

  const manifestLines = orderedPaths.map((path) => `- ${path}`);
  const fileManifest = [
    `Indexed source files (${allPaths.length} total, ${selectedPaths.length} prioritized for review):`,
    ...manifestLines.slice(0, 500),
    orderedPaths.length > 500 ? `... and ${orderedPaths.length - 500} more paths` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    fileManifest,
    snippets,
    filesSampled: snippets.length,
    totalIndexedFiles: allPaths.length,
  };
}
