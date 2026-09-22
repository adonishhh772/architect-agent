import { EncryptedVaultBlobSchema, type EncryptedVaultBlob } from "./vaultCrypto.js";

const VAULT_STORAGE_KEY = "sentinel-encrypted-vault";

export function readStoredVaultBlob(): EncryptedVaultBlob | null {
  const raw = sessionStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return EncryptedVaultBlobSchema.parse(parsed);
  } catch {
    sessionStorage.removeItem(VAULT_STORAGE_KEY);
    return null;
  }
}

export function writeStoredVaultBlob(blob: EncryptedVaultBlob): void {
  sessionStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));
}

export function clearStoredVaultBlob(): void {
  sessionStorage.removeItem(VAULT_STORAGE_KEY);
}

export function hasStoredVaultBlob(): boolean {
  return readStoredVaultBlob() !== null;
}
