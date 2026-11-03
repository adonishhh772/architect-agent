import type { IndexedFile, RepositoryFileIndex } from "@sentinel/schema";
import { countLines, detectLanguage, shouldExcludePath } from "./exclusions.js";

export interface RawRepositoryFile {
  path: string;
  content: string;
}

export interface BuildIndexOptions {
  commitSha?: string;
  userExclusions?: string[];
  maxIndexedFiles?: number;
}

export interface RepositoryStore {
  index: RepositoryFileIndex;
  contents: Map<string, string>;
}

export function buildRepositoryStore(
  files: RawRepositoryFile[],
  options: BuildIndexOptions = {},
): RepositoryStore {
  const maxIndexed = options.maxIndexedFiles ?? 5000;
  const userExclusionSet = new Set(
    (options.userExclusions ?? []).map((pattern) => pattern.trim()).filter(Boolean),
  );

  const index: RepositoryFileIndex = {
    commitSha: options.commitSha,
    rootPath: "",
    files: new Map<string, IndexedFile>(),
  };
  const contents = new Map<string, string>();

  let indexedCount = 0;
  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const exclusion = shouldExcludePath(normalizedPath);
    let excluded = exclusion.excluded;
    let exclusionReason = exclusion.reason;

    for (const pattern of userExclusionSet) {
      if (normalizedPath.includes(pattern)) {
        excluded = true;
        exclusionReason = "user_excluded";
        break;
      }
    }

    const lineCount = countLines(file.content);
    const entry: IndexedFile = {
      path: normalizedPath,
      size: file.content.length,
      lineCount,
      language: detectLanguage(normalizedPath),
      excluded,
      exclusionReason,
    };

    index.files.set(normalizedPath, entry);

    if (!excluded && indexedCount < maxIndexed) {
      contents.set(normalizedPath, file.content);
      indexedCount += 1;
    }
  }

  return { index, contents };
}
