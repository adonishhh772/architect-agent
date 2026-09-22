import { describe, expect, it } from "vitest";
import { decryptVaultSecrets, encryptVaultSecrets } from "../vaultCrypto.js";

describe("vaultCrypto", () => {
  it("encrypts and decrypts secrets with passphrase", async () => {
    const secrets = { modelApiKey: "sk-test-key", githubToken: null };
    const blob = await encryptVaultSecrets(secrets, "strong-passphrase-123");
    const decrypted = await decryptVaultSecrets(blob, "strong-passphrase-123");
    expect(decrypted.modelApiKey).toBe("sk-test-key");
  });

  it("persists optional provider settings in the vault blob", async () => {
    const secrets = {
      modelApiKey: "sk-test-key",
      githubToken: null,
      providerSettings: {
        providerId: "deepseek" as const,
        modelId: "deepseek-v4-pro",
        customEndpointConfirmed: false,
        requestTimeoutMs: 120_000,
        maxConcurrency: 2,
        maxRetries: 2,
      },
    };
    const blob = await encryptVaultSecrets(secrets, "vault-passphrase");
    const decrypted = await decryptVaultSecrets(blob, "vault-passphrase");
    expect(decrypted.providerSettings?.modelId).toBe("deepseek-v4-pro");
  });

  it("rejects wrong passphrase", async () => {
    const blob = await encryptVaultSecrets(
      { modelApiKey: "sk-test", githubToken: null },
      "correct-passphrase",
    );
    await expect(decryptVaultSecrets(blob, "wrong-passphrase")).rejects.toThrow();
  });
});
