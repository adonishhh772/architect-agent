import type { CoverageReport, RepositoryFileIndex } from "@sentinel/schema";

export function buildCoverageReport(
  index: RepositoryFileIndex,
  options: {
    truncated?: boolean;
    truncationReason?: string;
    indexedContentCount: number;
  },
): CoverageReport {
  const languages: Record<string, number> = {};
  let excludedFiles = 0;

  for (const file of index.files.values()) {
    if (file.excluded) {
      excludedFiles += 1;
      continue;
    }
    if (file.language) {
      languages[file.language] = (languages[file.language] ?? 0) + 1;
    }
  }

  const unsupportedLanguages = [...index.files.values()]
    .filter((file) => !file.excluded && !file.language)
    .slice(0, 20)
    .map((file) => file.path);

  return {
    commitSha: index.commitSha,
    totalFilesIndexed: options.indexedContentCount,
    excludedFiles,
    truncated: options.truncated ?? false,
    truncationReason: options.truncationReason,
    languages,
    unsupportedLanguages,
    unresolvedDependencies: [],
    submodulesDetected: [],
    missingConfiguration: detectMissingConfiguration(index),
    entries: [
      {
        area: "typescript_javascript",
        status: (languages.typescript ?? 0) + (languages.javascript ?? 0) > 0 ? "partial" : "unsupported",
        detail: "Deep static extraction for TS/JS; other languages use inventory-only coverage.",
        fileCount: (languages.typescript ?? 0) + (languages.javascript ?? 0),
      },
      {
        area: "infrastructure",
        status: hasInfraFiles(index) ? "partial" : "skipped",
        detail: "Docker/K8s/CI files indexed when present",
      },
    ],
    unresolvedQuestions: [],
  };
}

function hasInfraFiles(index: RepositoryFileIndex): boolean {
  for (const path of index.files.keys()) {
    if (
      path.includes("docker-compose") ||
      path.endsWith("Dockerfile") ||
      path.includes(".github/workflows") ||
      path.includes("kubernetes")
    ) {
      return true;
    }
  }
  return false;
}

function detectMissingConfiguration(index: RepositoryFileIndex): string[] {
  const missing: string[] = [];
  const paths = [...index.files.keys()];
  if (!paths.some((path) => path.endsWith("package.json"))) {
    missing.push("package.json");
  }
  if (!paths.some((path) => path.includes(".github/workflows"))) {
    missing.push("ci_workflow");
  }
  return missing;
}
