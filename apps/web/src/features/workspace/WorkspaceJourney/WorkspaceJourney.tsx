import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import type { WorkspaceJourneyStep } from "./workspaceJourneyModel";
import { WORKSPACE_STEP_STATUS } from "./workspaceJourneyModel";

interface WorkspaceJourneyProps {
  steps: WorkspaceJourneyStep[];
  nextAction: string;
}

export function WorkspaceJourney({ steps, nextAction }: WorkspaceJourneyProps): JSX.Element {
  const [showFinished, setShowFinished] = useState(false);
  const finished = steps.filter((step) => step.status === WORKSPACE_STEP_STATUS.COMPLETE);
  const allFinished = finished.length === steps.length;
  const visible = showFinished || allFinished ? steps : steps.filter((step) => step.status !== WORKSPACE_STEP_STATUS.COMPLETE);

  function handleToggleFinished(): void {
    setShowFinished((current) => !current);
  }

  return (
    <section className="space-y-4" data-testid="workspace-journey" aria-label="Workspace journey">
      {finished.length > 0 && !allFinished && (
        <button type="button" className="text-sm font-medium text-[var(--md-primary)] underline" onClick={handleToggleFinished} data-testid="workspace-toggle-finished">
          {showFinished ? "Hide finished steps" : `${finished.length} finished ${finished.length === 1 ? "step" : "steps"}`}
        </button>
      )}
      <ol className="grid gap-3 md:grid-cols-4">
        {visible.map((step) => (
          <JourneyStep key={step.id} step={step} stepNumber={steps.findIndex((item) => item.id === step.id) + 1} stepCount={steps.length} />
        ))}
      </ol>
      <p className="flex items-start gap-3 rounded-2xl border border-[var(--md-primary)]/30 bg-[var(--md-primary-container)]/35 px-4 py-3 text-sm text-[var(--md-on-surface)]" data-testid="workspace-next-action">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--md-primary)]" aria-hidden />
        <span>
          <span className="font-semibold">Next: </span>
          {nextAction}
        </span>
      </p>
    </section>
  );
}

interface JourneyStepProps {
  step: WorkspaceJourneyStep;
  stepNumber: number;
  stepCount: number;
}

function JourneyStep({ step, stepNumber, stepCount }: JourneyStepProps): JSX.Element {
  const complete = step.status === WORKSPACE_STEP_STATUS.COMPLETE;
  const active = step.status === WORKSPACE_STEP_STATUS.ACTIVE;
  return (
    <li
      className={`rounded-2xl border p-4 transition ${
        active
          ? "border-[var(--md-primary)] bg-[var(--md-primary-container)]/45 shadow-md"
          : complete
            ? "border-[var(--color-neon-green)]/35 bg-[var(--md-surface-container)]"
            : "border-[var(--md-outline)]/40 bg-[var(--md-surface-container)]/70"
      }`}
      data-testid={`workspace-step-${step.id}`}
      data-status={step.status}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
            complete
              ? "bg-[var(--color-neon-green)]/20 text-[var(--color-neon-green)]"
              : "bg-[var(--md-surface-container-high)] text-[var(--md-primary)]"
          }`}
        >
          {complete ? <Check className="h-4 w-4" aria-hidden /> : stepNumber}
        </span>
        <span className="text-xs font-semibold text-[var(--md-on-surface-variant)]">
          {stepNumber}/{stepCount}
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--md-on-surface)]">{step.label}</p>
      <p className="mt-1 text-xs text-[var(--md-on-surface-variant)]">{step.description}</p>
    </li>
  );
}
