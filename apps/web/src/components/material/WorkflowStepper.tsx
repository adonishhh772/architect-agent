import clsx from "clsx";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: "pending" | "active" | "complete";
}

interface WorkflowStepperProps {
  steps: WorkflowStep[];
}

export function WorkflowStepper({ steps }: WorkflowStepperProps): JSX.Element {
  return (
    <ol className="grid gap-3 md:grid-cols-4" aria-label="Provider setup workflow">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <li
            key={step.id}
            className={clsx(
              "rounded-2xl border p-4 transition",
              step.status === "active" && "border-[var(--md-primary)] bg-[var(--md-primary-container)]/40",
              step.status === "complete" && "border-[var(--md-outline)] bg-[var(--md-surface-container)]",
              step.status === "pending" && "border-[var(--md-outline)]/60 bg-[var(--md-surface)] opacity-80",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--md-surface-container-high)]">
                {step.status === "complete" ? (
                  <Check className="h-4 w-4 text-[var(--md-primary)]" aria-hidden />
                ) : (
                  <Icon className="h-4 w-4 text-[var(--md-primary)]" aria-hidden />
                )}
              </span>
              <span className="text-xs font-semibold text-[var(--md-on-surface-variant)]">
                {index + 1}/{steps.length}
              </span>
            </div>
            <p className="text-sm font-semibold text-[var(--md-on-surface)]">{step.label}</p>
            <p className="mt-1 text-xs text-[var(--md-on-surface-variant)]">{step.description}</p>
          </li>
        );
      })}
    </ol>
  );
}
