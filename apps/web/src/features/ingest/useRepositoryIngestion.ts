import {
  buildRepositoryStore,
  extractZipSafely,
  fetchGitHubRepository,
  parseGitHubRepositoryUrl,
  type RawRepositoryFile,
} from "@sentinel/ingestion";
import { fileIndexFromRecord } from "@sentinel/schema";
import { useCallback, useRef, useState } from "react";
import type { IndexWorkerResponse } from "../../workers/repositoryIndex.worker";
import IndexWorker from "../../workers/repositoryIndex.worker?worker";
import { getBrowserGitHubFetchOptions } from "./githubBrowserTransport";

export interface IngestionProgress {
  message: string;
  completed: number;
  total: number;
}

export interface IngestionResult {
  store: ReturnType<typeof buildRepositoryStore>;
  commitSha?: string;
  truncated: boolean;
  sourceLabel: string;
}

export function useRepositoryIngestion(): {
  isLoading: boolean;
  progress: IngestionProgress | null;
  error: string | null;
  ingestGitHubUrl: (url: string, githubToken?: string, exclusions?: string[]) => Promise<IngestionResult>;
  ingestZipFile: (file: File, exclusions?: string[]) => Promise<IngestionResult>;
  cancel: () => void;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const indexWithWorker = useCallback(
    async (
      files: RawRepositoryFile[],
      commitSha: string | undefined,
      userExclusions: string[] | undefined,
    ) => {
      const worker = new IndexWorker();
      try {
        const response = await new Promise<IndexWorkerResponse>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<IndexWorkerResponse>) => resolve(event.data);
          worker.onerror = () => reject(new Error("Indexing worker failed"));
          worker.postMessage({
            type: "index",
            files,
            commitSha,
            userExclusions,
          });
        });
        const index = fileIndexFromRecord(response.indexRecord);
        const contents = new Map<string, string>(response.contentEntries);
        return { index, contents };
      } finally {
        worker.terminate();
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const ingestGitHubUrl = useCallback(
    async (url: string, githubToken?: string, exclusions?: string[]) => {
      setIsLoading(true);
      setError(null);
      abortRef.current = new AbortController();
      try {
        const repoRef = parseGitHubRepositoryUrl(url);
        if (!repoRef) {
          throw new Error("Invalid GitHub repository URL");
        }
        const fetched = await fetchGitHubRepository(repoRef, {
          ...getBrowserGitHubFetchOptions(),
          maxFiles: 1500,
          token: githubToken,
          signal: abortRef.current.signal,
          onProgress: (message, completed, total) => {
            setProgress({ message, completed, total });
          },
        });
        const files: RawRepositoryFile[] = fetched.files.map((file) => ({
          path: file.path,
          content: file.content,
        }));
        setProgress({ message: "Indexing in Web Worker", completed: 0, total: 1 });
        const partial = await indexWithWorker(files, fetched.commitSha, exclusions);
        return {
          store: { index: partial.index, contents: partial.contents },
          commitSha: fetched.commitSha,
          truncated: fetched.truncated,
          sourceLabel: `${repoRef.owner}/${repoRef.name}@${fetched.commitSha.slice(0, 7)}`,
        };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Ingestion failed";
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    },
    [indexWithWorker],
  );

  const ingestZipFile = useCallback(
    async (file: File, exclusions?: string[]) => {
      setIsLoading(true);
      setError(null);
      try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const entries = extractZipSafely(buffer);
        const files: RawRepositoryFile[] = entries.map((entry) => ({
          path: entry.path,
          content: entry.content,
        }));
        setProgress({ message: "Indexing in Web Worker", completed: 0, total: 1 });
        const partial = await indexWithWorker(files, undefined, exclusions);
        return {
          store: partial,
          truncated: false,
          sourceLabel: file.name,
        };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "ZIP ingestion failed";
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    },
    [indexWithWorker],
  );

  return { isLoading, progress, error, ingestGitHubUrl, ingestZipFile, cancel };
}
