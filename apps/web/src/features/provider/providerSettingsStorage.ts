import { ProviderSettingsSchema, type ProviderSettings } from "@sentinel/schema";
import { replaceRetiredOpenAiModel } from "./providerDefaults";

const PROVIDER_SETTINGS_STORAGE_KEY = "sentinel-provider-settings";
const PROVIDER_SETTINGS_USER_SAVED_KEY = "sentinel-provider-settings-user-saved";

export function hasUserSavedProviderSettings(): boolean {
  return localStorage.getItem(PROVIDER_SETTINGS_USER_SAVED_KEY) === "1";
}

export function markUserSavedProviderSettings(): void {
  localStorage.setItem(PROVIDER_SETTINGS_USER_SAVED_KEY, "1");
}

export function readStoredProviderSettings(): ProviderSettings | null {
  if (!hasUserSavedProviderSettings()) {
    localStorage.removeItem(PROVIDER_SETTINGS_STORAGE_KEY);
    return null;
  }
  const raw = localStorage.getItem(PROVIDER_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const settings = replaceRetiredOpenAiModel(ProviderSettingsSchema.parse(parsed));
    if (settings.modelId !== (parsed as { modelId?: string }).modelId) {
      localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
    return settings;
  } catch {
    localStorage.removeItem(PROVIDER_SETTINGS_STORAGE_KEY);
    localStorage.removeItem(PROVIDER_SETTINGS_USER_SAVED_KEY);
    return null;
  }
}

export function writeStoredProviderSettings(settings: ProviderSettings): void {
  const parsed = ProviderSettingsSchema.parse(settings);
  localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
  markUserSavedProviderSettings();
}

export function clearStoredProviderSettings(): void {
  localStorage.removeItem(PROVIDER_SETTINGS_STORAGE_KEY);
  localStorage.removeItem(PROVIDER_SETTINGS_USER_SAVED_KEY);
}
