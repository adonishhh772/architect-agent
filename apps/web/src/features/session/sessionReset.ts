import { clearStoredProviderSettings } from "../provider/providerSettingsStorage.js";
import { clearWorkspaceSession } from "../workspace/workspaceSessionStore.js";
import { clearStoredVaultBlob } from "../vault/vaultStorage.js";

const INDEXED_DB_NAME = "architecture-sentinel";

export async function clearSentinelIndexedDb(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(INDEXED_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete IndexedDB"));
    request.onblocked = () => resolve();
  });
}

/** Removes vault, provider prefs, and saved reports from this browser. Theme is kept. */
export async function clearAllSentinelSessionData(): Promise<void> {
  clearStoredVaultBlob();
  clearStoredProviderSettings();
  await clearWorkspaceSession().catch(() => undefined);
  await clearSentinelIndexedDb();
}
