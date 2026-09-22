import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  testId?: string;
}

export function PageSection({
  title,
  description,
  icon: Icon,
  children,
  className,
  testId,
}: PageSectionProps): JSX.Element {
  return (
    <section
      className={clsx(
        "md-elevated-card relative overflow-hidden border-[var(--md-outline)]/25 bg-[var(--md-surface-container)]/90 backdrop-blur-sm",
        className,
      )}
      data-testid={testId}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--md-primary-container)]/50 text-[var(--md-primary)]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )}
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{description}</p>
            )}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
