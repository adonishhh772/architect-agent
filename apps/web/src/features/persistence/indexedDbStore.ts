import { AnalysisReportSchema, sanitizeReportForExport, type AnalysisReport } from "@sentinel/schema";
import type { AgentWorkItem } from "../analysis/AgentActivityPanel/agentWorkState";
import { openVaultJson, sealVaultJson } from "../vault/vaultCrypto";

const DB_NAME = "architecture-sentinel";
const DB_VERSION = 2;
const REPORT_STORE = "reports";
const WORKSPACE_SESSION_STORE = "workspace_session";

export interface PersistedReportRecord {
  id: string;
  savedAt: string;
  report: AnalysisReport;
  agentWork: AgentWorkItem[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath: "id" });
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

interface SealedRecord {
  id: string;
  savedAt: string;
  iv: string;
  ciphertext: string;
  report?: AnalysisReport;
  agentWork?: AgentWorkItem[];
}

export async function saveReportLocally(
  report: AnalysisReport,
  agentWork: AgentWorkItem[] = [],
  vaultCipher?: CryptoKey | null,
): Promise<void> {
  const cipher = requireVaultCipher(vaultCipher);
  const sanitized = sanitizeReportForExport(report);
  const payload: PersistedReportRecord = {
    id: sanitized.id,
    savedAt: new Date().toISOString(),
    report: sanitized,
    agentWork,
  };
  const sealed = await sealVaultJson(cipher, payload);
  await writeReportRecord({
    id: payload.id,
    savedAt: payload.savedAt,
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
  });
}

export async function listSavedReports(vaultCipher?: CryptoKey | null): Promise<PersistedReportRecord[]> {
  const cipher = requireVaultCipher(vaultCipher);
  const db = await openDatabase();
  const records = await new Promise<SealedRecord[]>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readonly");
    const request = tx.objectStore(REPORT_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SealedRecord[]);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
  db.close();
  const opened: PersistedReportRecord[] = [];
  for (const record of records) {
    const payload = await openStoredReport(record, cipher);
    opened.push(normalizeSavedRun(payload));
  }
  return sortSavedRunsNewestFirst(opened);
}

function requireVaultCipher(vaultCipher: CryptoKey | null | undefined): CryptoKey {
  if (!vaultCipher) {
    throw new Error(VAULT_LOCKED_MESSAGE);
  }
  return vaultCipher;
}

async function openStoredReport(record: SealedRecord, cipher: CryptoKey): Promise<PersistedReportRecord> {
  if (record.ciphertext && record.iv) {
    const parsed: unknown = await openVaultJson(cipher, record);
    return parsed as PersistedReportRecord;
  }
  if (!record.report) {
    throw new Error("Saved report is missing vault ciphertext.");
  }
  const plaintext: PersistedReportRecord = {
    id: record.id,
    savedAt: record.savedAt,
    report: record.report,
    agentWork: record.agentWork ?? [],
  };
  const sealed = await sealVaultJson(cipher, plaintext);
  await writeReportRecord({
    id: plaintext.id,
    savedAt: plaintext.savedAt,
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
  });
  return plaintext;
}

async function writeReportRecord(record: SealedRecord): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readwrite");
    tx.objectStore(REPORT_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
}

export function sortSavedRunsNewestFirst(records: PersistedReportRecord[]): PersistedReportRecord[] {
  return [...records].sort(compareRunsNewestFirst);
}

function compareRunsNewestFirst(left: PersistedReportRecord, right: PersistedReportRecord): number {
  const byTime = right.savedAt.localeCompare(left.savedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return right.id.localeCompare(left.id);
}

function normalizeSavedRun(record: PersistedReportRecord): PersistedReportRecord {
  return {
    ...record,
    agentWork: record.agentWork ?? [],
  };
}

export async function deleteSavedReport(reportId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readwrite");
    tx.objectStore(REPORT_STORE).delete(reportId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
  db.close();
}

export function parseImportedReportJson(text: string): AnalysisReport {
  const parsed: unknown = JSON.parse(text);
  return AnalysisReportSchema.parse(parsed);
}
