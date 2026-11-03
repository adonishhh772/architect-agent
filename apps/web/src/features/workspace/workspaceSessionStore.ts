import type { RepositoryStore } from "@sentinel/ingestion";
import {
  AnalysisReportSchema,
  RepositoryFileIndexSchema,
  fileIndexFromRecord,
  fileIndexToRecord,
  sanitizeReportForExport,
  type AnalysisReport,
} from "@sentinel/schema";
import { z } from "zod";
import { openVaultJson, sealVaultJson } from "../vault/vaultCrypto";

const DB_NAME = "architecture-sentinel";
const DB_VERSION = 2;
const WORKSPACE_SESSION_STORE = "workspace_session";
const WORKSPACE_SESSION_KEY = "current";

const PersistedWorkspaceSessionSchema = z.object({
  id: z.literal(WORKSPACE_SESSION_KEY),
  savedAt: z.string().datetime(),
  sourceLabel: z.string().min(1),
  repoUrl: z.string().optional(),
  commitSha: z.string().optional(),
  indexRecord: RepositoryFileIndexSchema,
  contentEntries: z.array(z.tuple([z.string(), z.string()])),
  lastReport: AnalysisReportSchema.optional(),
});

export type PersistedWorkspaceSession = z.infer<typeof PersistedWorkspaceSessionSchema>;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("reports")) {
        db.createObjectStore("reports", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_SESSION_STORE)) {
        db.createObjectStore(WORKSPACE_SESSION_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

const VAULT_LOCKED_MESSAGE = "Unlock the vault to save this workspace.";

export async function saveWorkspaceSession(
  input: {
    store: RepositoryStore;
    sourceLabel: string;
    repoUrl?: string;
    commitSha?: string;
    lastReport?: AnalysisReport | null;
  },
  vaultCipher?: CryptoKey | null,
): Promise<void> {
  if (!vaultCipher) {
    throw new Error(VAULT_LOCKED_MESSAGE);
  }
  const record: PersistedWorkspaceSession = {
    id: WORKSPACE_SESSION_KEY,
    savedAt: new Date().toISOString(),
    sourceLabel: input.sourceLabel,
    repoUrl: input.repoUrl,
    commitSha: input.commitSha,
    indexRecord: fileIndexToRecord(input.store.index),
    contentEntries: [...input.store.contents.entries()],
    lastReport: input.lastReport ? sanitizeReportForExport(input.lastReport) : undefined,
  };
  PersistedWorkspaceSessionSchema.parse(record);
  const sealed = await sealVaultJson(vaultCipher, record);
  await writeWorkspaceRecord({
    id: WORKSPACE_SESSION_KEY,
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
  });
}

export async function loadWorkspaceSession(vaultCipher?: CryptoKey | null): Promise<{
  store: RepositoryStore;
  sourceLabel: string;
  repoUrl?: string;
  commitSha?: string;
  lastReport?: AnalysisReport;
  savedAt: string;
} | null> {
  if (!vaultCipher) {
    throw new Error(VAULT_LOCKED_MESSAGE);
  }
  const db = await openDatabase();
  const stored = await new Promise<WorkspaceEnvelope | undefined>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_SESSION_STORE, "readonly");
    const request = tx.objectStore(WORKSPACE_SESSION_STORE).get(WORKSPACE_SESSION_KEY);
    request.onsuccess = () => resolve(request.result as WorkspaceEnvelope | undefined);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB workspace read failed"));
  });
  db.close();

  if (!stored) {
    return null;
  }
  const parsed = await readWorkspaceEnvelope(stored, vaultCipher);
  return {
    store: {
      index: fileIndexFromRecord(parsed.indexRecord),
      contents: new Map(parsed.contentEntries),
    },
    sourceLabel: parsed.sourceLabel,
    repoUrl: parsed.repoUrl,
    commitSha: parsed.commitSha,
    lastReport: parsed.lastReport,
    savedAt: parsed.savedAt,
  };
}

interface WorkspaceEnvelope {
  id: string;
  iv?: string;
  ciphertext?: string;
  indexRecord?: PersistedWorkspaceSession["indexRecord"];
  contentEntries?: PersistedWorkspaceSession["contentEntries"];
  sourceLabel?: string;
  savedAt?: string;
  repoUrl?: string;
  commitSha?: string;
  lastReport?: AnalysisReport;
}

async function readWorkspaceEnvelope(stored: WorkspaceEnvelope, vaultCipher: CryptoKey): Promise<PersistedWorkspaceSession> {
  if (stored.ciphertext && stored.iv) {
    const parsed: unknown = await openVaultJson(vaultCipher, { iv: stored.iv, ciphertext: stored.ciphertext });
    return PersistedWorkspaceSessionSchema.parse(parsed);
  }
  const parsed = PersistedWorkspaceSessionSchema.parse(stored);
  const sealed = await sealVaultJson(vaultCipher, parsed);
  await writeWorkspaceRecord({
    id: WORKSPACE_SESSION_KEY,
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
  });
  return parsed;
}

async function writeWorkspaceRecord(record: { id: string; iv: string; ciphertext: string }): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_SESSION_STORE, "readwrite");
    tx.objectStore(WORKSPACE_SESSION_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB workspace write failed"));
  });
  db.close();
}

export async function clearWorkspaceSession(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_SESSION_STORE, "readwrite");
    tx.objectStore(WORKSPACE_SESSION_STORE).delete(WORKSPACE_SESSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB workspace delete failed"));
  });
  db.close();
}
