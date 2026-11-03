import { buildRepositoryStore, type RawRepositoryFile } from "@sentinel/ingestion";
import { fileIndexToRecord } from "@sentinel/schema";

export interface IndexWorkerRequest {
  type: "index";
  files: RawRepositoryFile[];
  commitSha?: string;
  userExclusions?: string[];
}

export interface IndexWorkerResponse {
  type: "indexed";
  indexRecord: ReturnType<typeof fileIndexToRecord>;
  contentEntries: Array<[string, string]>;
}

self.onmessage = (event: MessageEvent<IndexWorkerRequest>) => {
  if (event.data.type !== "index") {
    return;
  }
  const store = buildRepositoryStore(event.data.files, {
    commitSha: event.data.commitSha,
    userExclusions: event.data.userExclusions,
  });
  const response: IndexWorkerResponse = {
    type: "indexed",
    indexRecord: fileIndexToRecord(store.index),
    contentEntries: [...store.contents.entries()],
  };
  self.postMessage(response);
};
