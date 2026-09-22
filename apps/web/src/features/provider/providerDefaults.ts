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
  [PROVIDER_ID.OPENAI]: "o3",
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
      id: "o3",
      label: "o3 (flagship reasoning)",
      description: "OpenAI reasoning model for complex analysis and multi-step tasks.",
    },
    {
      id: "o3-mini",
      label: "o3-mini",
      description: "Lower-latency reasoning with strong cost/performance balance.",
    },
    {
      id: "o4-mini",
      label: "o4-mini",
      description: "Compact reasoning model; good for high-volume investigation loops.",
    },
    {
      id: "o1",
      label: "o1",
      description: "Earlier reasoning series; use if o3 is unavailable on your account.",
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
      id: "o3",
      label: "o3",
      description: "Use when your compatible gateway proxies OpenAI reasoning models.",
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

export function getDefaultReasoningModelId(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
): string {
  return DEFAULT_REASONING_MODEL_BY_PROVIDER[providerId];
}
