const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9])/;

export function splitSummarySentences(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(SENTENCE_BOUNDARY).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}
