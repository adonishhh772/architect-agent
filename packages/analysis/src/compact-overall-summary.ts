import type { AiProviderAdapter, ProviderUsage } from "@sentinel/providers";

const WINDOW_NOTE_MARKER = "this window";
const OVERVIEW_COMPACT_THRESHOLD = 600;
const SUMMARY_OUTPUT_TOKENS = 500;
const SUMMARY_TEMPERATURE = 0.2;
const EMPTY_SUMMARY_MESSAGE = "The model returned an empty summary.";
const SUMMARY_SYSTEM_PROMPT =
  "Rewrite these audit notes as one short overall summary of the repository. Use complete sentences. Do not stop in the middle of a word. Do not repeat file-window notes one by one. Use at most six sentences.";

export interface CompactOverallSummaryInput {
  provider: AiProviderAdapter;
  apiKey: string;
  overview: string;
}

export interface CompactOverallSummaryResult {
  text: string;
  usage: ProviderUsage;
}

export function overviewNeedsCompaction(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return trimmed.toLowerCase().includes(WINDOW_NOTE_MARKER) || trimmed.length > OVERVIEW_COMPACT_THRESHOLD;
}

export async function compactOverallSummary(
  input: CompactOverallSummaryInput,
): Promise<CompactOverallSummaryResult> {
  const completion = await input.provider.complete(input.apiKey, {
    messages: [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: input.overview.trim() },
    ],
    maxOutputTokens: SUMMARY_OUTPUT_TOKENS,
    temperature: SUMMARY_TEMPERATURE,
  });
  const text = completion.text.trim();
  if (!text) {
    throw new Error(EMPTY_SUMMARY_MESSAGE);
  }
  return { text, usage: completion.usage };
}
