import { runFollowUpCopilot, type FollowUpResult } from "@sentinel/analysis";
import { createProviderAdapter } from "@sentinel/providers";
import type { ArchitectureGraph, Finding, ProviderSettings } from "@sentinel/schema";
import { MessageSquare } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { MaterialButton } from "../../../components/material/MaterialButton";
import { getBrowserProviderSettingsForAi } from "../../provider/aiBrowserTransport";

const SUGGESTED_QUESTION = {
  DATA_FLOW: "Which untrusted inputs reach a code, HTML, SQL, command, or outbound request sink?",
  CALLERS: "Who calls the functions that sit on a source-to-sink chain?",
  REVIEW: "Which findings should a reviewer treat as new or regressed on this snapshot?",
} as const;

interface FollowUpCopilotProps {
  contents: Map<string, string>;
  graph: ArchitectureGraph;
  findings: Finding[];
  providerSettings: ProviderSettings;
  apiKey: string | null;
  transmissionConfirmed: boolean;
  browserReady: boolean;
}

export function FollowUpCopilot({
  contents,
  graph,
  findings,
  providerSettings,
  apiKey,
  transmissionConfirmed,
  browserReady,
}: FollowUpCopilotProps): JSX.Element {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FollowUpResult | null>(null);

  const guidance =
    !browserReady || !apiKey || !transmissionConfirmed
      ? resolveBlockedReason({
          apiKey,
          transmissionConfirmed,
          browserReady,
          question: "ready",
          isLoading: false,
        })
      : null;

  const blockedReason = resolveBlockedReason({
    apiKey,
    transmissionConfirmed,
    browserReady,
    question,
    isLoading,
  });

  const handleQuestionChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setQuestion(event.target.value);
  };

  const handleSuggestDataFlow = (): void => {
    setQuestion(SUGGESTED_QUESTION.DATA_FLOW);
  };

  const handleSuggestCallers = (): void => {
    setQuestion(SUGGESTED_QUESTION.CALLERS);
  };

  const handleSuggestReview = (): void => {
    setQuestion(SUGGESTED_QUESTION.REVIEW);
  };

  const askQuestion = async (nextQuestion: string): Promise<void> => {
    if (!apiKey || !transmissionConfirmed || !browserReady || !nextQuestion.trim()) {
      setError(blockedReason ?? "Follow-up is not ready.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const provider = createProviderAdapter(getBrowserProviderSettingsForAi(providerSettings));
      const answer = await runFollowUpCopilot({
        question: nextQuestion.trim(),
        contents,
        graph,
        findings,
        provider,
        apiKey,
      });
      setResult(answer);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Follow-up failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void askQuestion(question);
  };

  return (
    <div className="space-y-4" data-testid="follow-up-copilot">
      <p className="flex items-center gap-2 text-sm text-[var(--md-on-surface-variant)]">
        <MessageSquare className="h-4 w-4 text-[var(--md-primary)]" aria-hidden />
        Ask about a file, a caller, or a data-flow chain. The answer stays advisory and cites the indexed snapshot.
      </p>
      <div className="flex flex-wrap gap-2">
        <MaterialButton variant="outlined" onClick={handleSuggestDataFlow} data-testid="suggest-data-flow">
          Trace sinks
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={handleSuggestCallers} data-testid="suggest-callers">
          Find callers
        </MaterialButton>
        <MaterialButton variant="outlined" onClick={handleSuggestReview} data-testid="suggest-review">
          Review ranking
        </MaterialButton>
      </div>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-[var(--md-on-surface)]" htmlFor="follow-up-question">
          Follow-up question
        </label>
        <textarea
          id="follow-up-question"
          className="glass-input min-h-24 w-full"
          value={question}
          onChange={handleQuestionChange}
          data-testid="follow-up-question"
        />
        <MaterialButton type="submit" disabled={Boolean(blockedReason)} data-testid="follow-up-submit">
          {isLoading ? "Reading the snapshot…" : "Ask the copilot"}
        </MaterialButton>
      </form>
      {guidance && (
        <p className="text-sm text-amber-700 dark:text-amber-200" data-testid="follow-up-blocked">
          {guidance}
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--color-neon-pink)]" data-testid="follow-up-error">
          {error}
        </p>
      )}
      {result && (
        <div data-testid="follow-up-answer" className="space-y-2 text-sm text-[var(--md-on-surface)]">
          <p className="whitespace-pre-wrap leading-relaxed">{result.answer}</p>
          {result.citations.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[var(--md-on-surface-variant)]">
              {result.citations.map((citation) => (
                <li key={`${citation.path}:${citation.startLine ?? 0}`}>
                  {citation.path}
                  {citation.startLine ? `:${citation.startLine}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function resolveBlockedReason(input: {
  apiKey: string | null;
  transmissionConfirmed: boolean;
  browserReady: boolean;
  question: string;
  isLoading: boolean;
}): string | null {
  if (input.isLoading) {
    return "A follow-up is already running.";
  }
  if (!input.browserReady) {
    return "This provider cannot be called from the browser.";
  }
  if (!input.apiKey) {
    return "Save a provider API key in the vault before asking a follow-up.";
  }
  if (!input.transmissionConfirmed) {
    return "Confirm source transmission before asking a follow-up.";
  }
  if (!input.question.trim()) {
    return "Enter a question first.";
  }
  return null;
}
