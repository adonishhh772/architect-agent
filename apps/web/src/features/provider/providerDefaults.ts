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

export const REASONING_EFFORT = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type ReasoningEffort = (typeof REASONING_EFFORT)[keyof typeof REASONING_EFFORT];

export const REASONING_EFFORT_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
  description: string;
}> = [
  {
    value: REASONING_EFFORT.LOW,
    label: "Low",
    description: "Faster reviews. Less depth on each finding.",
  },
  {
    value: REASONING_EFFORT.MEDIUM,
    label: "Medium",
    description: "Balanced depth and speed for a normal threat model.",
  },
  {
    value: REASONING_EFFORT.HIGH,
    label: "High",
    description: "Deepest analysis. Takes longer and uses more of the provider quota.",
  },
];

const MODEL_ID_BY_EFFORT: Record<
  (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
  Record<ReasoningEffort, string>
> = {
  [PROVIDER_ID.OPENAI]: {
    [REASONING_EFFORT.LOW]: "gpt-4.1-mini",
    [REASONING_EFFORT.MEDIUM]: "gpt-5-mini",
    [REASONING_EFFORT.HIGH]: "gpt-5",
  },
  [PROVIDER_ID.ANTHROPIC]: {
    [REASONING_EFFORT.LOW]: "claude-3-7-sonnet-20250219",
    [REASONING_EFFORT.MEDIUM]: "claude-sonnet-4-20250514",
    [REASONING_EFFORT.HIGH]: "claude-opus-4-20250514",
  },
  [PROVIDER_ID.GEMINI]: {
    [REASONING_EFFORT.LOW]: "gemini-2.0-flash-thinking-exp",
    [REASONING_EFFORT.MEDIUM]: "gemini-2.5-flash",
    [REASONING_EFFORT.HIGH]: "gemini-2.5-pro",
  },
  [PROVIDER_ID.DEEPSEEK]: {
    [REASONING_EFFORT.LOW]: "deepseek-reasoner",
    [REASONING_EFFORT.MEDIUM]: "deepseek-v4-flash",
    [REASONING_EFFORT.HIGH]: "deepseek-v4-pro",
  },
  [PROVIDER_ID.OPENAI_COMPATIBLE]: {
    [REASONING_EFFORT.LOW]: "deepseek-reasoner",
    [REASONING_EFFORT.MEDIUM]: "deepseek-v4-flash",
    [REASONING_EFFORT.HIGH]: "deepseek-v4-pro",
  },
};

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (
    value === REASONING_EFFORT.LOW ||
    value === REASONING_EFFORT.MEDIUM ||
    value === REASONING_EFFORT.HIGH
  );
}

export function modelIdForReasoningEffort(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
  effort: ReasoningEffort,
): string {
  return MODEL_ID_BY_EFFORT[providerId][effort];
}

export function inferReasoningEffort(
  providerId: (typeof PROVIDER_ID)[keyof typeof PROVIDER_ID],
  modelId: string,
): ReasoningEffort {
  const models = MODEL_ID_BY_EFFORT[providerId];
  if (models[REASONING_EFFORT.LOW] === modelId) {
    return REASONING_EFFORT.LOW;
  }
  if (models[REASONING_EFFORT.MEDIUM] === modelId) {
    return REASONING_EFFORT.MEDIUM;
  }
  if (models[REASONING_EFFORT.HIGH] === modelId) {
    return REASONING_EFFORT.HIGH;
  }
  return REASONING_EFFORT.HIGH;
}

export function resolveSelectedEffort(
  providerId: string,
  modelId: string,
  storedEffort: string | undefined,
): ReasoningEffort {
  if (storedEffort && isReasoningEffort(storedEffort)) {
    return storedEffort;
  }
  if (!isProviderId(providerId)) {
    return REASONING_EFFORT.HIGH;
  }
  return inferReasoningEffort(providerId, modelId);
}

export function alignSettingsToReasoningEffort<T extends { providerId: string; modelId: string; reasoningEffort?: string }>(
  settings: T,
): T {
  if (!isProviderId(settings.providerId)) {
    return settings;
  }
  const effort = resolveSelectedEffort(settings.providerId, settings.modelId, settings.reasoningEffort);
  return {
    ...settings,
    reasoningEffort: effort,
    modelId: modelIdForReasoningEffort(settings.providerId, effort),
  };
}

export function reasoningEffortLabel(effort: ReasoningEffort): string {
  const match = REASONING_EFFORT_OPTIONS.find((option) => option.value === effort);
  return match ? match.label : REASONING_EFFORT_OPTIONS[2].label;
}
