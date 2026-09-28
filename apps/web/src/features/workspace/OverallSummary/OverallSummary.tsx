import type { ProviderSettings } from "@sentinel/schema";
import { SummaryBlocks } from "../SummaryBlocks";
import { COMPACTING_SUMMARY_MESSAGE, useCompactOverallSummary } from "./useCompactOverallSummary";

interface OverallSummaryProps {
  text: string;
  providerSettings: ProviderSettings;
  apiKey: string | null;
  transmissionConfirmed: boolean;
  browserReady: boolean;
}

export function OverallSummary({
  text,
  providerSettings,
  apiKey,
  transmissionConfirmed,
  browserReady,
}: OverallSummaryProps): JSX.Element {
  const compacted = useCompactOverallSummary(text, providerSettings, apiKey, transmissionConfirmed, browserReady);

  return (
    <div data-testid="overall-summary">
      {compacted.isLoading && (
        <p className="mb-3 text-sm text-[var(--md-primary)]" data-testid="summary-compacting">
          {COMPACTING_SUMMARY_MESSAGE}
        </p>
      )}
      {compacted.error && (
        <p className="mb-3 text-sm text-[var(--color-neon-pink)]" data-testid="summary-compact-error">
          {compacted.error}
        </p>
      )}
      <SummaryBlocks text={compacted.summary ?? text} />
    </div>
  );
}
