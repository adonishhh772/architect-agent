import { PROVIDER_ID, type ProviderSettings } from "@sentinel/schema";
import { createOpenAiAdapter } from "./openai-adapter.js";
import type { FetchFn } from "./types.js";

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

export function createDeepSeekAdapter(
  settings: ProviderSettings,
  fetchFn: FetchFn = fetch,
) {
  return createOpenAiAdapter(
    { ...settings, providerId: PROVIDER_ID.DEEPSEEK },
    fetchFn,
    settings.endpoint?.replace(/\/$/, "") ?? DEEPSEEK_BASE,
  );
}
