import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children?: ReactNode;
}

export function PageHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: PageHeroProps): JSX.Element {
  return (
    <section className="home-hero relative overflow-hidden rounded-3xl border border-[var(--md-outline)]/30 px-6 py-8 sm:px-10 sm:py-10">
      <div className="home-hero-grid pointer-events-none absolute inset-0 opacity-35" aria-hidden />
      <div className="home-hero-orb home-hero-orb-blue pointer-events-none absolute -top-20 -left-16 h-56 w-56 rounded-full blur-3xl" aria-hidden />
      <div className="home-hero-orb home-hero-orb-purple pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rounded-full blur-3xl" aria-hidden />

      <div className="relative home-hero-copy">
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--md-primary)]/30 bg-[var(--md-primary-container)]/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--md-primary)]">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {eyebrow}
        </p>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-[var(--md-on-surface)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--md-on-surface-variant)]">
          {description}
        </p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}
