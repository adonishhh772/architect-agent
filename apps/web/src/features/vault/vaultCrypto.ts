import { ProviderSettingsSchema } from "@sentinel/schema";
import { z } from "zod";

export const VAULT_VERSION = 1 as const;

export const VaultSecretsSchema = z.object({
  modelApiKey: z.string().nullable(),
  githubToken: z.string().nullable(),
  providerSettings: ProviderSettingsSchema.optional(),
});

export type VaultSecrets = z.infer<typeof VaultSecretsSchema>;

export const EncryptedVaultBlobSchema = z.object({
  version: z.literal(VAULT_VERSION),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});

export type EncryptedVaultBlob = z.infer<typeof EncryptedVaultBlobSchema>;

const PBKDF2_ITERATIONS = 250_000;

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptVaultSecrets(
  secrets: VaultSecrets,
  passphrase: string,
): Promise<EncryptedVaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(VaultSecretsSchema.parse(secrets)));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    version: VAULT_VERSION,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptVaultSecrets(
  blob: EncryptedVaultBlob,
  passphrase: string,
): Promise<VaultSecrets> {
  const parsedBlob = EncryptedVaultBlobSchema.parse(blob);
  const salt = decodeBase64(parsedBlob.salt);
  const iv = decodeBase64(parsedBlob.iv);
  const ciphertext = decodeBase64(parsedBlob.ciphertext);
  const key = await deriveVaultKey(passphrase, salt);
  try {
    const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const decoder = new TextDecoder();
    const parsed: unknown = JSON.parse(decoder.decode(plaintextBuffer));
    return VaultSecretsSchema.parse(parsed);
  } catch {
    throw new Error("Invalid vault passphrase or corrupted vault data");
  }
}
