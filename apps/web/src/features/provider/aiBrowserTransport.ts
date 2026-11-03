import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

const BROWSER_PROVIDER_IDS = new Set<ProviderSettings["providerId"]>([
  PROVIDER_ID.OPENAI,
  PROVIDER_ID.ANTHROPIC,
  PROVIDER_ID.GEMINI,
  PROVIDER_ID.DEEPSEEK,
  PROVIDER_ID.OPENAI_COMPATIBLE,
]);

export function canRunProviderInBrowser(providerId: ProviderSettings["providerId"]): boolean {
  return BROWSER_PROVIDER_IDS.has(providerId);
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
