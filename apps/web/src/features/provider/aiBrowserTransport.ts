import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function canRunProviderInBrowser(providerId: ProviderSettings["providerId"]): boolean {
  if (providerId === PROVIDER_ID.GEMINI || providerId === PROVIDER_ID.DEEPSEEK) {
    return true;
  }
  if (!isLocalDevHost()) {
    return false;
  }
  return (
    providerId === PROVIDER_ID.DEEPSEEK ||
    providerId === PROVIDER_ID.OPENAI ||
    providerId === PROVIDER_ID.OPENAI_COMPATIBLE
  );
}

export function getBrowserProviderSettingsForAi(settings: ProviderSettings): ProviderSettings {
  if (!isLocalDevHost()) {
    return settings;
  }
  const origin = window.location.origin;
  if (settings.providerId === PROVIDER_ID.DEEPSEEK) {
    return {
      ...settings,
      endpoint: `${origin}/__sentinel/ai/deepseek/v1`,
    };
  }
  if (settings.providerId === PROVIDER_ID.OPENAI) {
    return {
      ...settings,
      endpoint: `${origin}/__sentinel/ai/openai/v1`,
    };
  }
  return settings;
}
