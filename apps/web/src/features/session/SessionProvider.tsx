import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProviderSettings } from "@sentinel/schema";
import { ProviderSettingsSchema } from "@sentinel/schema";
import {
  decryptVaultSecrets,
  encryptVaultSecrets,
  type VaultSecrets,
} from "../vault/vaultCrypto.js";
import {
  clearStoredProviderSettings,
  hasUserSavedProviderSettings,
  readStoredProviderSettings,
  writeStoredProviderSettings,
} from "../provider/providerSettingsStorage.js";
import { clearAllSentinelSessionData } from "./sessionReset.js";
import {
  clearStoredVaultBlob,
  hasStoredVaultBlob,
  readStoredVaultBlob,
  writeStoredVaultBlob,
} from "../vault/vaultStorage.js";

export type VaultStatus = "no_vault" | "locked" | "unlocked";

interface SessionContextValue {
  providerSettings: ProviderSettings;
  setProviderSettings: (settings: ProviderSettings) => void;
  setModelApiKey: (key: string | null) => Promise<void>;
  setGithubToken: (token: string | null) => Promise<void>;
  getModelApiKey: () => string | null;
  getGithubToken: () => string | null;
  clearSession: () => void;
  resetAllSessionData: () => Promise<void>;
  aiTransmissionConfirmed: boolean;
  setAiTransmissionConfirmed: (confirmed: boolean) => void;
  vaultStatus: VaultStatus;
  hasStoredVault: boolean;
  connectionTested: boolean;
  setConnectionTested: (tested: boolean) => void;
  createVault: (passphrase: string, secrets: VaultSecrets) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<boolean>;
  lockVault: () => void;
  destroyVault: () => void;
  canUseAiInvestigation: () => boolean;
  hasModelApiKey: boolean;
  /** Provider + model last stored in the encrypted vault (after unlock / save). */
  vaultSavedProviderSettings: ProviderSettings | null;
  /** True only after you pick a provider/model or save provider settings in the vault. */
  hasConfiguredProviderSettings: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = ProviderSettingsSchema.parse({
  providerId: "gemini",
  modelId: "gemini-2.5-pro",
  requestTimeoutMs: 120_000,
  maxConcurrency: 2,
  maxRetries: 2,
});

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps): JSX.Element {
  const memorySecretsRef = useRef<VaultSecrets>({
    modelApiKey: null,
    githubToken: null,
  });
  const unlockPassphraseRef = useRef<string | null>(null);

  const [providerSettings, setProviderSettingsState] = useState<ProviderSettings>(() => {
    return readStoredProviderSettings() ?? DEFAULT_PROVIDER_SETTINGS;
  });
  const [vaultSavedProviderSettings, setVaultSavedProviderSettings] =
    useState<ProviderSettings | null>(null);
  const [aiTransmissionConfirmed, setAiTransmissionConfirmed] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>("no_vault");
  const [hasStoredVault, setHasStoredVault] = useState(false);
  const [hasModelApiKey, setHasModelApiKey] = useState(false);
  const [hasConfiguredProviderSettings, setHasConfiguredProviderSettings] = useState(() =>
    hasUserSavedProviderSettings(),
  );

  useEffect(() => {
    const stored = hasStoredVaultBlob();
    setHasStoredVault(stored);
    setVaultStatus(stored ? "locked" : "no_vault");
  }, []);

  const persistSecrets = useCallback(async (secrets: VaultSecrets): Promise<void> => {
    const passphrase = unlockPassphraseRef.current;
    if (!passphrase) {
      throw new Error("Vault is locked");
    }
    const encrypted = await encryptVaultSecrets(secrets, passphrase);
    writeStoredVaultBlob(encrypted);
    setHasStoredVault(true);
    if (secrets.providerSettings) {
      setVaultSavedProviderSettings(ProviderSettingsSchema.parse(secrets.providerSettings));
    }
  }, []);

  const syncProviderSettingsToVault = useCallback(
    (settings: ProviderSettings): void => {
      if (!unlockPassphraseRef.current) {
        return;
      }
      memorySecretsRef.current = {
        ...memorySecretsRef.current,
        providerSettings: settings,
      };
      void persistSecrets(memorySecretsRef.current);
    },
    [persistSecrets],
  );

  const wipeMemorySecrets = useCallback((): void => {
    memorySecretsRef.current = { modelApiKey: null, githubToken: null };
    unlockPassphraseRef.current = null;
    setHasModelApiKey(false);
  }, []);

  const setModelApiKey = useCallback(
    async (key: string | null): Promise<void> => {
      if (!unlockPassphraseRef.current) {
        throw new Error("Unlock the vault before storing API keys.");
      }
      memorySecretsRef.current = {
        ...memorySecretsRef.current,
        modelApiKey: key,
        providerSettings,
      };
      setHasModelApiKey(Boolean(key));
      writeStoredProviderSettings(providerSettings);
      setHasConfiguredProviderSettings(true);
      await persistSecrets(memorySecretsRef.current);
      setConnectionTested(false);
    },
    [persistSecrets, providerSettings],
  );

  const setGithubToken = useCallback(
    async (token: string | null): Promise<void> => {
      if (vaultStatus !== "unlocked") {
        memorySecretsRef.current.githubToken = token;
        return;
      }
      memorySecretsRef.current.githubToken = token;
      await persistSecrets(memorySecretsRef.current);
    },
    [persistSecrets, vaultStatus],
  );

  const getModelApiKey = useCallback((): string | null => {
    if (vaultStatus !== "unlocked") {
      return null;
    }
    return memorySecretsRef.current.modelApiKey;
  }, [vaultStatus]);

  const getGithubToken = useCallback((): string | null => {
    if (vaultStatus !== "unlocked") {
      return null;
    }
    return memorySecretsRef.current.githubToken;
  }, [vaultStatus]);

  const setProviderSettings = useCallback(
    (settings: ProviderSettings) => {
      const parsed = ProviderSettingsSchema.parse(settings);
      setProviderSettingsState(parsed);
      writeStoredProviderSettings(parsed);
      setHasConfiguredProviderSettings(true);
      syncProviderSettingsToVault(parsed);
      setConnectionTested(false);
    },
    [syncProviderSettingsToVault],
  );

  const createVault = useCallback(
    async (passphrase: string, secrets: VaultSecrets): Promise<void> => {
      const localProviderSettings = readStoredProviderSettings();
      const mergedSecrets: VaultSecrets = {
        ...secrets,
        providerSettings:
          secrets.providerSettings ?? localProviderSettings ?? providerSettings,
      };
      const encrypted = await encryptVaultSecrets(mergedSecrets, passphrase);
      writeStoredVaultBlob(encrypted);
      unlockPassphraseRef.current = passphrase;
      memorySecretsRef.current = mergedSecrets;
      setHasStoredVault(true);
      setVaultStatus("unlocked");
      setHasModelApiKey(Boolean(mergedSecrets.modelApiKey));
      const activeSettings = ProviderSettingsSchema.parse(
        mergedSecrets.providerSettings ?? providerSettings,
      );
      setProviderSettingsState(activeSettings);
      if (hasUserSavedProviderSettings() || secrets.providerSettings) {
        writeStoredProviderSettings(activeSettings);
        setHasConfiguredProviderSettings(true);
      }
      setVaultSavedProviderSettings(
        secrets.providerSettings || hasUserSavedProviderSettings() ? activeSettings : null,
      );
      setConnectionTested(false);
      setAiTransmissionConfirmed(false);
    },
    [providerSettings],
  );

  const unlockVault = useCallback(async (passphrase: string): Promise<boolean> => {
    const blob = readStoredVaultBlob();
    if (!blob) {
      return false;
    }
    try {
      const secrets = await decryptVaultSecrets(blob, passphrase);
      unlockPassphraseRef.current = passphrase;
      memorySecretsRef.current = secrets;
      setVaultStatus("unlocked");
      setHasModelApiKey(Boolean(secrets.modelApiKey));

      const localProviderSettings = readStoredProviderSettings();
      const vaultProviderSettings = secrets.providerSettings
        ? ProviderSettingsSchema.parse(secrets.providerSettings)
        : null;
      const activeSettings = localProviderSettings ?? vaultProviderSettings;

      if (activeSettings) {
        setProviderSettingsState(activeSettings);
        if (localProviderSettings || vaultProviderSettings) {
          writeStoredProviderSettings(activeSettings);
          setHasConfiguredProviderSettings(true);
        }
        setVaultSavedProviderSettings(vaultProviderSettings ?? activeSettings);
        if (
          localProviderSettings &&
          JSON.stringify(secrets.providerSettings) !== JSON.stringify(localProviderSettings)
        ) {
          memorySecretsRef.current = {
            ...secrets,
            providerSettings: activeSettings,
          };
          await persistSecrets(memorySecretsRef.current);
        }
      } else {
        setVaultSavedProviderSettings(null);
      }

      setConnectionTested(false);
      setAiTransmissionConfirmed(false);
      return true;
    } catch {
      return false;
    }
  }, [persistSecrets]);

  const lockVault = useCallback((): void => {
    wipeMemorySecrets();
    setVaultStatus(hasStoredVaultBlob() ? "locked" : "no_vault");
    setVaultSavedProviderSettings(null);
    setAiTransmissionConfirmed(false);
    setConnectionTested(false);
  }, [wipeMemorySecrets]);

  const destroyVault = useCallback((): void => {
    clearStoredVaultBlob();
    wipeMemorySecrets();
    setHasStoredVault(false);
    setVaultStatus("no_vault");
    setVaultSavedProviderSettings(null);
    setAiTransmissionConfirmed(false);
    setConnectionTested(false);
  }, [wipeMemorySecrets]);

  const resetAllSessionData = useCallback(async (): Promise<void> => {
    await clearAllSentinelSessionData();
    wipeMemorySecrets();
    setHasStoredVault(false);
    setVaultStatus("no_vault");
    setVaultSavedProviderSettings(null);
    setProviderSettingsState(DEFAULT_PROVIDER_SETTINGS);
    setHasConfiguredProviderSettings(false);
    setAiTransmissionConfirmed(false);
    setConnectionTested(false);
  }, [wipeMemorySecrets]);

  const clearSession = useCallback((): void => {
    void resetAllSessionData();
  }, [resetAllSessionData]);

  const canUseAiInvestigation = useCallback((): boolean => {
    return (
      vaultStatus === "unlocked" &&
      hasModelApiKey &&
      connectionTested &&
      aiTransmissionConfirmed
    );
  }, [vaultStatus, hasModelApiKey, connectionTested, aiTransmissionConfirmed]);

  const value = useMemo<SessionContextValue>(
    () => ({
      providerSettings,
      setProviderSettings,
      setModelApiKey,
      setGithubToken,
      getModelApiKey,
      getGithubToken,
      clearSession,
      resetAllSessionData,
      aiTransmissionConfirmed,
      setAiTransmissionConfirmed,
      vaultStatus,
      hasStoredVault,
      connectionTested,
      setConnectionTested,
      createVault,
      unlockVault,
      lockVault,
      destroyVault,
      canUseAiInvestigation,
      hasModelApiKey,
      vaultSavedProviderSettings,
      hasConfiguredProviderSettings,
    }),
    [
      providerSettings,
      setProviderSettings,
      setModelApiKey,
      setGithubToken,
      getModelApiKey,
      getGithubToken,
      clearSession,
      resetAllSessionData,
      aiTransmissionConfirmed,
      vaultStatus,
      hasStoredVault,
      connectionTested,
      createVault,
      unlockVault,
      lockVault,
      destroyVault,
      canUseAiInvestigation,
      hasModelApiKey,
      vaultSavedProviderSettings,
      hasConfiguredProviderSettings,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
