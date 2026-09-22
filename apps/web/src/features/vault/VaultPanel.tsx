import { KeyRound, Lock, LockOpen, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { MaterialButton } from "../../components/material/MaterialButton";
import { MaterialTextField } from "../../components/material/MaterialTextField";
import { useSession } from "../session/SessionProvider";

export function VaultPanel(): JSX.Element {
  const session = useSession();
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [modelApiKey, setModelApiKey] = useState("");
  const [rotateApiKey, setRotateApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreateVault = async (): Promise<void> => {
    if (passphrase.length < 8) {
      setMessage("Vault passphrase must be at least 8 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setMessage("Passphrases do not match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await session.createVault(passphrase, {
        modelApiKey: modelApiKey.trim() || null,
        githubToken: null,
        providerSettings: session.providerSettings,
      });
      setPassphrase("");
      setConfirmPassphrase("");
      setModelApiKey("");
      setMessage("Vault created and unlocked for this browser tab session.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create vault.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockVault = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const unlocked = await session.unlockVault(passphrase);
      if (!unlocked) {
        setMessage("Unable to unlock vault. Check your passphrase.");
        return;
      }
      setPassphrase("");
      setMessage("Vault unlocked. API keys are available in memory until you lock the vault.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRotateKey = async (): Promise<void> => {
    if (!rotateApiKey.trim()) {
      setMessage("Enter an API key to save in the vault.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await session.setModelApiKey(rotateApiKey.trim());
      setRotateApiKey("");
      setMessage("Model API key encrypted and saved in the vault.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save API key.");
    } finally {
      setBusy(false);
    }
  };

  const handleLockVault = (): void => {
    session.lockVault();
    setMessage("Vault locked. AI investigation is blocked until you unlock again.");
  };

  const handleResetAllSessionData = async (): Promise<void> => {
    const confirmed = window.confirm(
      "Reset all session data? This removes the vault, keys, provider settings, and saved reports in this browser.",
    );
    if (!confirmed) {
      return;
    }
    await session.resetAllSessionData();
    setPassphrase("");
    setConfirmPassphrase("");
    setModelApiKey("");
    setRotateApiKey("");
    setMessage("All session data cleared. Create a new vault when you are ready.");
  };

  return (
    <section className="md-elevated-card space-y-4" data-testid="vault-panel">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 text-[var(--md-primary)]" aria-hidden />
        <div>
          <h2 className="text-xl font-semibold text-[var(--md-on-surface)]">Credentials vault</h2>
          <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">
            API keys are encrypted with AES-GCM (PBKDF2-derived key) and stored only as ciphertext in
            sessionStorage for this tab. Plaintext keys exist in memory only while the vault is
            unlocked.
          </p>
          <p className="mt-2 text-xs font-medium text-[var(--md-on-surface-variant)]">
            Status:{" "}
            <span data-testid="vault-status">
              {session.vaultStatus === "unlocked"
                ? "Unlocked"
                : session.vaultStatus === "locked"
                  ? "Locked"
                  : "No vault"}
            </span>
            {session.vaultStatus === "unlocked" && session.hasModelApiKey && (
              <span className="ml-2 text-[var(--color-neon-green)]">· Model key stored</span>
            )}
          </p>
        </div>
      </div>

      {session.vaultStatus !== "unlocked" && (
        <div className="grid gap-4 md:grid-cols-2">
          <MaterialTextField
            label="Vault passphrase"
            type="password"
            allowReveal
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            leadingIcon={<KeyRound className="h-4 w-4" aria-hidden />}
            data-testid="vault-passphrase"
          />
          {session.vaultStatus === "no_vault" && (
            <>
              <MaterialTextField
                label="Confirm passphrase"
                type="password"
                allowReveal
                autoComplete="new-password"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
              />
              <MaterialTextField
                label="Model API key (optional)"
                type="password"
                allowReveal
                autoComplete="off"
                value={modelApiKey}
                onChange={(event) => setModelApiKey(event.target.value)}
                helperText="Optional at creation; you can add or rotate after unlock."
              />
            </>
          )}
        </div>
      )}

      {session.vaultStatus === "unlocked" && (
        <div className="rounded-2xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/40 p-4">
          <MaterialTextField
            label="Model API key"
            type="password"
            allowReveal
            autoComplete="off"
            value={rotateApiKey}
            onChange={(event) => setRotateApiKey(event.target.value)}
            helperText={
              session.hasModelApiKey
                ? "Enter a new key to rotate the encrypted vault entry."
                : "Paste your provider API key and save it to the vault."
            }
          />
          <div className="mt-3">
            <MaterialButton
              icon={<Save className="h-4 w-4" aria-hidden />}
              disabled={busy}
              onClick={handleSaveRotateKey}
            >
              Save key to vault
            </MaterialButton>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {session.vaultStatus === "no_vault" && (
          <MaterialButton
            icon={<LockOpen className="h-4 w-4" aria-hidden />}
            disabled={busy}
            onClick={handleCreateVault}
            data-testid="create-vault-button"
          >
            Create & unlock vault
          </MaterialButton>
        )}
        {session.vaultStatus === "locked" && (
          <MaterialButton
            icon={<LockOpen className="h-4 w-4" aria-hidden />}
            disabled={busy}
            onClick={handleUnlockVault}
            data-testid="unlock-vault-button"
          >
            Unlock vault
          </MaterialButton>
        )}
        {session.vaultStatus === "unlocked" && (
          <MaterialButton
            variant="outlined"
            icon={<Lock className="h-4 w-4" aria-hidden />}
            onClick={handleLockVault}
            data-testid="lock-vault-button"
          >
            Lock vault
          </MaterialButton>
        )}
        <MaterialButton
          variant="text"
          data-testid="reset-all-session-button"
          onClick={handleResetAllSessionData}
        >
          Reset all session data
        </MaterialButton>
      </div>

      {message && (
        <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="vault-message">
          {message}
        </p>
      )}
    </section>
  );
}
