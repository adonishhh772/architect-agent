import { createProviderAdapter, getProviderCapabilities } from "@sentinel/providers";
import { PROVIDER_ID, ProviderSettingsSchema } from "@sentinel/schema";
import {
  Bot,
  Cable,
  KeyRound,
  LockKeyhole,
  PlugZap,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MaterialButton } from "../../components/material/MaterialButton";
import { MaterialSelect } from "../../components/material/MaterialSelect";
import { MaterialTextField } from "../../components/material/MaterialTextField";
import { WorkflowStepper } from "../../components/material/WorkflowStepper";
import { useSession } from "../session/SessionProvider";
import { VaultPanel } from "../vault/VaultPanel";
import {
  getDefaultReasoningModelId,
  getReasoningPresetsForProvider,
  isProviderId,
} from "./providerDefaults";

const PROVIDER_OPTIONS = [
  { value: PROVIDER_ID.OPENAI, label: "OpenAI" },
  { value: PROVIDER_ID.ANTHROPIC, label: "Anthropic" },
  { value: PROVIDER_ID.GEMINI, label: "Google Gemini" },
  { value: PROVIDER_ID.DEEPSEEK, label: "DeepSeek" },
  { value: PROVIDER_ID.OPENAI_COMPATIBLE, label: "OpenAI-compatible (custom)" },
] as const;

function getProviderDisplayLabel(providerId: string): string {
  return PROVIDER_OPTIONS.find((option) => option.value === providerId)?.label ?? providerId;
}

export function ProviderSettingsPage(): JSX.Element {
  const session = useSession();
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const capabilities = getProviderCapabilities(session.providerSettings.providerId);
  const vaultUnlocked = session.vaultStatus === "unlocked";
  const hasModelKey = vaultUnlocked && session.hasModelApiKey;
  const reasoningPresets = getReasoningPresetsForProvider(session.providerSettings.providerId);
  const activeReasoningPreset = reasoningPresets.find(
    (preset) => preset.id === session.providerSettings.modelId,
  );
  const reasoningPresetOptions = useMemo(() => {
    const options = reasoningPresets.map((preset) => ({
      value: preset.id,
      label: preset.label,
    }));
    const modelIdInPresets = options.some(
      (option) => option.value === session.providerSettings.modelId,
    );
    if (!modelIdInPresets && session.providerSettings.modelId) {
      options.push({
        value: session.providerSettings.modelId,
        label: `Custom: ${session.providerSettings.modelId}`,
      });
    }
    return options;
  }, [reasoningPresets, session.providerSettings.modelId]);
  const reasoningPresetSelectValue = session.providerSettings.modelId;
  const savedProviderLabel = getProviderDisplayLabel(session.providerSettings.providerId);
  const activePresetLabel =
    activeReasoningPreset?.label ?? `Custom model (${session.providerSettings.modelId})`;
  const vaultStoresMatchingModel =
    session.vaultSavedProviderSettings?.modelId === session.providerSettings.modelId &&
    session.vaultSavedProviderSettings?.providerId === session.providerSettings.providerId;

  const workflowSteps = useMemo(() => {
    const unlockComplete = session.vaultStatus === "unlocked";
    const configureComplete = unlockComplete && hasModelKey;
    const testComplete = configureComplete && session.connectionTested;
    return [
      {
        id: "unlock",
        label: "Unlock vault",
        description: "Decrypt credentials with your passphrase",
        icon: LockKeyhole,
        status: unlockComplete ? ("complete" as const) : ("active" as const),
      },
      {
        id: "configure",
        label: "Configure provider",
        description: "Choose provider, model, and store API key",
        icon: PlugZap,
        status: !unlockComplete
          ? ("pending" as const)
          : configureComplete
            ? ("complete" as const)
            : ("active" as const),
      },
      {
        id: "test",
        label: "Test connection",
        description: "Verify authentication and model access",
        icon: Cable,
        status: !configureComplete
          ? ("pending" as const)
          : testComplete
            ? ("complete" as const)
            : ("active" as const),
      },
      {
        id: "ready",
        label: "Ready for AI",
        description: "Confirm transmission in workspace before investigation",
        icon: Bot,
        status: testComplete ? ("complete" as const) : ("pending" as const),
      },
    ];
  }, [session.vaultStatus, session.connectionTested, hasModelKey]);

  const handleProviderChange = (providerId: string): void => {
    if (!isProviderId(providerId)) {
      return;
    }
    session.setProviderSettings(
      ProviderSettingsSchema.parse({
        ...session.providerSettings,
        providerId,
        modelId: getDefaultReasoningModelId(providerId),
        endpoint: providerId === PROVIDER_ID.OPENAI_COMPATIBLE ? session.providerSettings.endpoint : undefined,
        customEndpointConfirmed:
          providerId === PROVIDER_ID.OPENAI_COMPATIBLE
            ? session.providerSettings.customEndpointConfirmed
            : false,
      }),
    );
    setTestMessage(
      `Provider set to ${providerId}. Model ID set to top reasoning default (${getDefaultReasoningModelId(providerId)}).`,
    );
  };

  const handleReasoningPresetChange = (presetId: string): void => {
    if (presetId === "custom") {
      setTestMessage("Enter a custom model ID supported by your compatible endpoint.");
      return;
    }
    session.setProviderSettings(
      ProviderSettingsSchema.parse({
        ...session.providerSettings,
        modelId: presetId,
      }),
    );
    const preset = reasoningPresets.find((entry) => entry.id === presetId);
    setTestMessage(preset ? `Reasoning preset: ${preset.label}` : "Model ID updated.");
  };

  const handleSaveKeyToVault = async (): Promise<void> => {
    if (!vaultUnlocked) {
      setTestMessage("Unlock the vault before saving API keys.");
      return;
    }
    if (!apiKeyDraft.trim()) {
      setTestMessage("Enter an API key to encrypt in the vault.");
      return;
    }
    setIsSaving(true);
    setTestMessage(null);
    try {
      await session.setModelApiKey(apiKeyDraft.trim());
      setApiKeyDraft("");
      setTestMessage("API key encrypted and stored in the vault.");
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "Failed to save key.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAllSessionData = async (): Promise<void> => {
    const confirmed = window.confirm(
      "Reset all session data? This removes the vault, saved API keys, provider/model preferences, and locally saved reports in this browser. You will start fresh.",
    );
    if (!confirmed) {
      return;
    }
    await session.resetAllSessionData();
    setApiKeyDraft("");
    setTestMessage("All session data cleared. Choose your provider and create a new vault.");
  };

  const handleTestConnection = async (): Promise<void> => {
    if (!vaultUnlocked) {
      setTestMessage("Unlock the vault before testing the provider.");
      return;
    }
    setIsTesting(true);
    setTestMessage(null);
    try {
      const key = session.getModelApiKey();
      if (!key) {
        setTestMessage("Save a model API key in the vault first.");
        return;
      }
      const adapter = createProviderAdapter(session.providerSettings);
      const result = await adapter.testConnection(key);
      if (result.ok) {
        session.setConnectionTested(true);
        setTestMessage(`Connection OK (${result.latencyMs ?? "?"} ms).`);
      } else {
        session.setConnectionTested(false);
        setTestMessage(result.error?.message ?? "Connection failed.");
      }
    } catch (error) {
      session.setConnectionTested(false);
      setTestMessage(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <VaultPanel />

      <section className="md-elevated-card space-y-4">
        <h2 className="text-xl font-semibold text-[var(--md-on-surface)]">Provider workflow</h2>
        <WorkflowStepper steps={workflowSteps} />
      </section>

      <section className="md-elevated-card space-y-5">
        <div className="flex items-center gap-2">
          <PlugZap className="h-5 w-5 text-[var(--md-primary)]" aria-hidden />
          <h2 className="text-xl font-semibold text-[var(--md-on-surface)]">AI provider settings</h2>
        </div>
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          Browser mode can call providers that allow CORS from your origin. Keys never leave the vault
          unencrypted at rest.
        </p>

        {session.hasConfiguredProviderSettings ? (
          <div
            className="rounded-xl border border-[var(--md-outline)]/40 bg-[var(--md-surface-container)] px-4 py-3"
            data-testid="saved-provider-configuration"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--md-on-surface-variant)]">
              Saved configuration
            </p>
            <p className="mt-1 text-sm text-[var(--md-on-surface)]">
              Provider: <strong>{savedProviderLabel}</strong>
            </p>
            <p className="mt-1 font-mono text-base text-[var(--md-primary)]" data-testid="saved-model-id">
              {session.providerSettings.modelId}
            </p>
            <p className="mt-1 text-xs text-[var(--md-on-surface-variant)]">
              {activePresetLabel}
              {vaultUnlocked && vaultStoresMatchingModel
                ? " · stored in encrypted vault"
                : " · saved in this browser"}
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl border border-dashed border-[var(--md-outline)]/50 bg-[var(--md-surface-container)]/50 px-4 py-3"
            data-testid="provider-not-configured"
          >
            <p className="text-sm text-[var(--md-on-surface)]">No provider saved yet</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">
              The dropdowns below show suggested defaults only (currently {savedProviderLabel},{" "}
              {session.providerSettings.modelId}). Nothing is stored until you change provider, model,
              or save an API key to the vault.
            </p>
          </div>
        )}

        <MaterialSelect
          label="Provider"
          testId="provider-select"
          value={session.providerSettings.providerId}
          options={[...PROVIDER_OPTIONS]}
          onChange={handleProviderChange}
        />

        <MaterialSelect
          label="Reasoning model preset"
          testId="reasoning-model-preset"
          value={reasoningPresetSelectValue}
          options={reasoningPresetOptions}
          onChange={handleReasoningPresetChange}
        />
        {activeReasoningPreset && (
          <p className="text-xs leading-relaxed text-[var(--md-on-surface-variant)]">
            {activeReasoningPreset.description}
          </p>
        )}

        <MaterialTextField
          label="Model ID (manual override)"
          data-testid="model-id-input"
          value={session.providerSettings.modelId}
          helperText={`Top reasoning default for ${session.providerSettings.providerId}: ${getDefaultReasoningModelId(session.providerSettings.providerId)}. Confirm the ID exists on your account.`}
          onChange={(event) =>
            session.setProviderSettings(
              ProviderSettingsSchema.parse({
                ...session.providerSettings,
                modelId: event.target.value,
              }),
            )
          }
        />

        {session.providerSettings.providerId === PROVIDER_ID.OPENAI_COMPATIBLE && (
          <>
            <MaterialTextField
              label="Custom endpoint URL"
              value={session.providerSettings.endpoint ?? ""}
              onChange={(event) =>
                session.setProviderSettings(
                  ProviderSettingsSchema.parse({
                    ...session.providerSettings,
                    endpoint: event.target.value,
                    customEndpointConfirmed: false,
                  }),
                )
              }
            />
            <label className="flex items-center gap-2 text-sm text-[var(--md-on-surface)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--md-primary)]"
                checked={session.providerSettings.customEndpointConfirmed}
                onChange={(event) =>
                  session.setProviderSettings(
                    ProviderSettingsSchema.parse({
                      ...session.providerSettings,
                      customEndpointConfirmed: event.target.checked,
                    }),
                  )
                }
              />
              I confirm credentials may be sent to this endpoint
            </label>
          </>
        )}

        {!vaultUnlocked && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
            Unlock the credentials vault above before you can enter or save a model API key.
          </p>
        )}

        <MaterialTextField
          label="Model API key"
          type="password"
          autoComplete="off"
          allowReveal
          data-testid="api-key-input"
          value={apiKeyDraft}
          disabled={!vaultUnlocked}
          onChange={(event) => setApiKeyDraft(event.target.value)}
          leadingIcon={<KeyRound className="h-4 w-4" aria-hidden />}
          helperText={
            vaultUnlocked
              ? hasModelKey
                ? "A key is stored in the vault. Enter a new value to rotate."
                : "Paste your key, then click Save key to vault."
              : "Unlock the vault to add or rotate keys."
          }
        />

        <div className="flex flex-wrap gap-2">
          <MaterialButton
            icon={<Save className="h-4 w-4" aria-hidden />}
            disabled={!vaultUnlocked || isSaving}
            onClick={handleSaveKeyToVault}
          >
            {isSaving ? "Saving…" : "Save key to vault"}
          </MaterialButton>
          <MaterialButton
            variant="outlined"
            icon={<Cable className="h-4 w-4" aria-hidden />}
            disabled={!vaultUnlocked || isTesting}
            onClick={handleTestConnection}
          >
            {isTesting ? "Testing…" : "Test connection"}
          </MaterialButton>
          <MaterialButton
            variant="text"
            icon={<Trash2 className="h-4 w-4" aria-hidden />}
            onClick={handleResetAllSessionData}
            data-testid="reset-all-session-button"
          >
            Reset all session data
          </MaterialButton>
        </div>

        {testMessage && (
          <p className="text-sm text-[var(--md-on-surface-variant)]" data-testid="connection-result">
            {testMessage}
          </p>
        )}
      </section>

      <section className="md-elevated-card">
        <h3 className="font-semibold text-[var(--md-on-surface)]">Capabilities</h3>
        <ul className="mt-3 space-y-2 text-sm text-[var(--md-on-surface-variant)]">
          <li>Browser callable: {capabilities.browserCallable ? "yes" : "no"}</li>
          <li>Structured output: {capabilities.structuredOutput ? "yes" : "partial"}</li>
          <li>Model discovery: {capabilities.modelDiscovery ? "yes" : "no"}</li>
        </ul>
        {capabilities.notes.map((note) => (
          <p key={note} className="mt-2 text-sm text-[var(--md-on-surface-variant)]">
            {note}
          </p>
        ))}
      </section>
    </div>
  );
}
