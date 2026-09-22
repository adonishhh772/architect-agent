import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface HomeFeatureCardProps {
  title: string;
  icon: LucideIcon;
  accentClass: string;
  children: ReactNode;
  className?: string;
}

export function HomeFeatureCard({
  title,
  icon: Icon,
  accentClass,
  children,
  className,
}: HomeFeatureCardProps): JSX.Element {
  return (
    <article
      className={clsx(
        "group relative overflow-hidden rounded-2xl border border-[var(--md-outline)]/25 bg-[var(--md-surface-container)]/80 p-6 backdrop-blur-sm transition duration-300 hover:border-[var(--md-primary)]/40 hover:shadow-lg",
        className,
      )}
    >
      <div
        className={clsx(
          "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-20 blur-3xl transition duration-500 group-hover:opacity-35",
          accentClass,
        )}
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span
          className={clsx(
            "flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[var(--md-surface-container-high)] shadow-inner",
            accentClass.replace("bg-", "text-"),
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--md-on-surface)]">
          {title}
        </h3>
      </div>
      <div className="relative mt-4 text-sm leading-relaxed text-[var(--md-on-surface-variant)]">
        {children}
      </div>
    </article>
  );
}
