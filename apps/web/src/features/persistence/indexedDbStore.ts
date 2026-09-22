import { AnalysisReportSchema, sanitizeReportForExport, type AnalysisReport } from "@sentinel/schema";

const DB_NAME = "architecture-sentinel";
const DB_VERSION = 2;
const REPORT_STORE = "reports";
const WORKSPACE_SESSION_STORE = "workspace_session";

export interface PersistedReportRecord {
  id: string;
  savedAt: string;
  report: AnalysisReport;
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

export async function saveReportLocally(report: AnalysisReport): Promise<void> {
  const sanitized = sanitizeReportForExport(report);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readwrite");
    const store = tx.objectStore(REPORT_STORE);
    const record: PersistedReportRecord = {
      id: sanitized.id,
      savedAt: new Date().toISOString(),
      report: sanitized,
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
}

export async function listSavedReports(): Promise<PersistedReportRecord[]> {
  const db = await openDatabase();
  const records = await new Promise<PersistedReportRecord[]>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readonly");
    const store = tx.objectStore(REPORT_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as PersistedReportRecord[]);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
  db.close();
  return records;
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
