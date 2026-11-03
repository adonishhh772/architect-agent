const ANSWER_TOKEN_RESERVE = 8_192;

const THINKING_TOKENS = {
  low: 1_024,
  medium: 4_096,
  high: 8_192,
} as const;

type ReasoningEffort = "low" | "medium" | "high";

const REASONING_MODEL = /^(?:o1|o3|o4|gpt-5)(?:$|[-.])|deepseek-(?:reasoner|v4)/i;
const ANTHROPIC_THINKING_MODEL = /claude-(?:3-7|opus-4|sonnet-4|haiku-4)/i;

export function modelReservesReasoning(modelId: string): boolean {
  return REASONING_MODEL.test(modelId.trim());
}

export function anthropicModelThinks(modelId: string): boolean {
  return ANTHROPIC_THINKING_MODEL.test(modelId.trim());
}

export function thinkingTokensForEffort(effort: ReasoningEffort | undefined): number {
  if (effort === "low" || effort === "high") {
    return THINKING_TOKENS[effort];
  }
  return THINKING_TOKENS.medium;
}

export function completionTokenLimit(requested: number | undefined, thinkingTokens: number): number {
  const answerTokens = Math.max(requested ?? ANSWER_TOKEN_RESERVE, 1);
  if (thinkingTokens <= 0) {
    return answerTokens;
  }
  return answerTokens + thinkingTokens;
}
