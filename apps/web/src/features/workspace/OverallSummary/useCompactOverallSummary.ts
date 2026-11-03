import { compactOverallSummary, overviewNeedsCompaction } from "@sentinel/analysis";
import { createProviderAdapter } from "@sentinel/providers";
import type { ProviderSettings } from "@sentinel/schema";
import { useEffect, useState } from "react";
import { getBrowserProviderSettingsForAi } from "../../provider/aiBrowserTransport";

const COMPACTING_SUMMARY_MESSAGE = "Compacting the overall summary…";
const SUMMARY_FAILED_MESSAGE = "The overall summary could not be compacted.";

interface CompactOverallSummaryState {
  summary: string | null;
  isLoading: boolean;
  error: string | null;
}

const summaryCache = new Map<string, string>();
const summaryRequests = new Map<string, Promise<string>>();

export function useCompactOverallSummary(
  text: string,
  providerSettings: ProviderSettings,
  apiKey: string | null,
  transmissionConfirmed: boolean,
  browserReady: boolean,
): CompactOverallSummaryState {
  const [summary, setSummary] = useState<string | null>(summaryCache.get(text) ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCompact = overviewNeedsCompaction(text) && Boolean(apiKey) && transmissionConfirmed && browserReady;

  useEffect(
    function compactSummaryWhenShown() {
      if (!canCompact || !apiKey) {
        return undefined;
      }
      const cached = summaryCache.get(text);
      if (cached) {
        setSummary(cached);
        setError(null);
        setIsLoading(false);
        return undefined;
      }

      let cancelled = false;
      setIsLoading(true);
      setError(null);
      const request = startSummaryRequest(text, providerSettings, apiKey);
      request
        .then(function storeCompactSummary(compacted: string) {
          if (cancelled) {
            return;
          }
          setSummary(compacted);
        })
        .catch(function recordSummaryFailure(caught: unknown) {
          if (cancelled) {
            return;
          }
          setSummary(null);
          setError(caught instanceof Error ? caught.message : SUMMARY_FAILED_MESSAGE);
        })
        .finally(function finishSummaryRequest() {
          if (!cancelled) {
            setIsLoading(false);
          }
        });

      return function cancelSummaryRequest() {
        cancelled = true;
      };
    },
    [apiKey, browserReady, canCompact, providerSettings, text, transmissionConfirmed],
  );

  return { summary, isLoading, error };
}

export { COMPACTING_SUMMARY_MESSAGE };

function startSummaryRequest(text: string, providerSettings: ProviderSettings, apiKey: string): Promise<string> {
  const pending = summaryRequests.get(text);
  if (pending) {
    return pending;
  }
  const provider = createProviderAdapter(getBrowserProviderSettingsForAi(providerSettings));
  const request = compactOverallSummary({ provider, apiKey, overview: text })
    .then(function rememberCompactSummary(result) {
      summaryCache.set(text, result.text);
      return result.text;
    })
    .finally(function clearSummaryRequest() {
      summaryRequests.delete(text);
    });
  summaryRequests.set(text, request);
  return request;
}
