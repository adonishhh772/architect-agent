import { EncryptedVaultBlobSchema, createVaultSalt, type EncryptedVaultBlob } from "./vaultCrypto.js";

const VAULT_STORAGE_KEY = "sentinel-encrypted-vault";
const WORKSPACE_SALT_KEY = "sentinel-workspace-salt";

export interface WorkspaceSaltChoice {
  salt: string;
  persistLocal: boolean;
  persistSession: boolean;
}

export function chooseWorkspaceSalt(input: {
  localSalt: string | null;
  sessionSalt: string | null;
  createdSalt: string;
}): WorkspaceSaltChoice {
  if (input.localSalt) {
    return {
      salt: input.localSalt,
      persistLocal: false,
      persistSession: input.sessionSalt !== input.localSalt,
    };
  }
  if (input.sessionSalt) {
    return {
      salt: input.sessionSalt,
      persistLocal: true,
      persistSession: false,
    };
  }
  return {
    salt: input.createdSalt,
    persistLocal: true,
    persistSession: true,
  };
}

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

export function clearWorkspaceSalt(): void {
  localStorage.removeItem(WORKSPACE_SALT_KEY);
  sessionStorage.removeItem(WORKSPACE_SALT_KEY);
}

export function readOrCreateWorkspaceSalt(): string {
  const chosen = chooseWorkspaceSalt({
    localSalt: readStorageSalt(localStorage),
    sessionSalt: readStorageSalt(sessionStorage),
    createdSalt: createVaultSalt(),
  });
  if (chosen.persistLocal) {
    localStorage.setItem(WORKSPACE_SALT_KEY, chosen.salt);
  }
  if (chosen.persistSession) {
    sessionStorage.setItem(WORKSPACE_SALT_KEY, chosen.salt);
  }
  return chosen.salt;
}

function readStorageSalt(storage: Storage): string | null {
  try {
    const value = storage.getItem(WORKSPACE_SALT_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function hasStoredVaultBlob(): boolean {
  return readStoredVaultBlob() !== null;
}
