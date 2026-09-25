import { EncryptedVaultBlobSchema, createVaultSalt, type EncryptedVaultBlob } from "./vaultCrypto.js";

const VAULT_STORAGE_KEY = "sentinel-encrypted-vault";
const WORKSPACE_SALT_KEY = "sentinel-workspace-salt";

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
  sessionStorage.removeItem(WORKSPACE_SALT_KEY);
}

export function readOrCreateWorkspaceSalt(): string {
  const existing = sessionStorage.getItem(WORKSPACE_SALT_KEY);
  if (existing) {
    return existing;
  }
  const salt = createVaultSalt();
  sessionStorage.setItem(WORKSPACE_SALT_KEY, salt);
  return salt;
}

export function hasStoredVaultBlob(): boolean {
  return readStoredVaultBlob() !== null;
}
