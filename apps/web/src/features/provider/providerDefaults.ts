import { PROVIDER_ID } from "@sentinel/schema";

export interface ReasoningModelPreset {
  id: string;
  label: string;
  description: string;
}

/**
 * Default model IDs prioritize each vendor's top reasoning-capable endpoint.
 * Verify IDs against current provider docs — model strings change over time.
 */
export const DEFAULT_REASONING_MODEL_BY_PROVIDER: Record<
  (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
  string
> = {
  [PROVIDER_ID.OPENAI]: "gpt-5",
  [PROVIDER_ID.ANTHROPIC]: "claude-opus-4-20250514",
  [PROVIDER_ID.GEMINI]: "gemini-2.5-pro",
  [PROVIDER_ID.DEEPSEEK]: "deepseek-v4-pro",
  [PROVIDER_ID.OPENAI_COMPATIBLE]: "deepseek-v4-pro",
};

/** @deprecated Use DEFAULT_REASONING_MODEL_BY_PROVIDER */
export const DEFAULT_MODEL_BY_PROVIDER = DEFAULT_REASONING_MODEL_BY_PROVIDER;

export const REASONING_MODEL_PRESETS_BY_PROVIDER: Record<
  (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
  ReasoningModelPreset[]
> = {
  [PROVIDER_ID.OPENAI]: [
    {
      id: "gpt-5",
      label: "GPT-5",
      description: "Current flagship for coding, reasoning, and multi-step threat analysis.",
    },
    {
      id: "gpt-5-mini",
      label: "GPT-5 mini",
      description: "Faster GPT-5 tier for high-volume investigation loops.",
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      description: "Strong instruction following and tool use, without a separate reasoning step.",
    },
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 mini",
      description: "Lower-cost GPT-4.1 tier for shorter review passes.",
    },
  ],
  [PROVIDER_ID.ANTHROPIC]: [
    {
      id: "claude-opus-4-20250514",
      label: "Claude Opus 4 (top reasoning)",
      description: "Highest-capability Claude tier for deep architecture and threat analysis.",
    },
    {
      id: "claude-sonnet-4-20250514",
      label: "Claude Sonnet 4",
      description: "Strong reasoning with lower cost; supports extended/adaptive thinking on supported accounts.",
    },
    {
      id: "claude-3-7-sonnet-20250219",
      label: "Claude 3.7 Sonnet (extended thinking)",
      description: "Hybrid model with visible extended thinking mode in the Messages API.",
    },
  ],
  [PROVIDER_ID.GEMINI]: [
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro (top reasoning)",
      description: "Google's most advanced 2.5 reasoning model; thinking enabled by default.",
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      description: "Hybrid reasoning with configurable thinking budget for faster loops.",
    },
    {
      id: "gemini-2.0-flash-thinking-exp",
      label: "Gemini 2.0 Flash Thinking (experimental)",
      description: "Legacy thinking experimental ID; prefer 2.5 Pro/Flash when available.",
    },
  ],
  [PROVIDER_ID.DEEPSEEK]: [
    {
      id: "deepseek-v4-pro",
      label: "DeepSeek V4 Pro (top reasoning)",
      description: "Enable thinking via API (thinking.type: enabled) for chain-of-thought analysis.",
    },
    {
      id: "deepseek-v4-flash",
      label: "DeepSeek V4 Flash",
      description: "Faster reasoning tier; supports thinking mode with reasoning_effort.",
    },
    {
      id: "deepseek-reasoner",
      label: "deepseek-reasoner (legacy alias)",
      description: "Legacy thinking alias; maps to V4 Flash thinking mode until deprecated.",
    },
  ],
  [PROVIDER_ID.OPENAI_COMPATIBLE]: [
    {
      id: "deepseek-v4-pro",
      label: "deepseek-v4-pro",
      description: "Common OpenAI-compatible reasoning endpoint on DeepSeek.",
    },
    {
      id: "gpt-5",
      label: "gpt-5",
      description: "Use when your compatible gateway proxies OpenAI GPT-5.",
    },
    {
      id: "custom",
      label: "Custom model ID",
      description: "Enter any model string supported by your compatible server below.",
    },
  ],
};

export function isProviderId(value: string): value is (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID] {
  return Object.values(PROVIDER_ID).includes(value as (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID]);
}

export function getReasoningPresetsForProvider(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
): ReasoningModelPreset[] {
  return REASONING_MODEL_PRESETS_BY_PROVIDER[providerId];
}

const RETIRED_OPENAI_MODEL_IDS = new Set(["o1", "o3", "o3-mini", "o4-mini"]);

export function replaceRetiredOpenAiModel<T extends { providerId: string; modelId: string }>(settings: T): T {
  if (settings.providerId !== PROVIDER_ID.OPENAI) {
    return settings;
  }
  if (!RETIRED_OPENAI_MODEL_IDS.has(settings.modelId)) {
    return settings;
  }
  return {
    ...settings,
    modelId: DEFAULT_REASONING_MODEL_BY_PROVIDER[PROVIDER_ID.OPENAI],
  };
}

export function getDefaultReasoningModelId(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
): string {
  return DEFAULT_REASONING_MODEL_BY_PROVIDER[providerId];
}
