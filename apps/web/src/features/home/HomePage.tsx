import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  GitBranch,
  KeyRound,
  Layers,
  LockKeyhole,
  Shield,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { HomeFeatureCard } from "./HomeFeatureCard";

const WORKFLOW_STEPS = [
  {
    icon: Layers,
    title: "Ingest",
    detail: "GitHub URL or ZIP, pinned commit when available",
  },
  {
    icon: GitBranch,
    title: "Map",
    detail: "Architecture graph, flows, and trust boundaries",
  },
  {
    icon: Shield,
    title: "Assess",
    detail: "STRIDE, OWASP, ATLAS, data and infrastructure risk",
  },
] as const;

export function HomePage(): JSX.Element {
  return (
    <div className="home-page mx-auto max-w-6xl space-y-10 pb-10">
      <section className="home-hero relative overflow-hidden rounded-3xl border border-[var(--md-outline)]/30 px-6 py-10 sm:px-10 sm:py-14">
        <div className="home-hero-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="home-hero-orb home-hero-orb-blue pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full blur-3xl" aria-hidden />
        <div className="home-hero-orb home-hero-orb-purple pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full blur-3xl" aria-hidden />
        <div className="home-hero-orb home-hero-orb-teal pointer-events-none absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" aria-hidden />

        <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="home-hero-copy">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--md-primary)]/30 bg-[var(--md-primary-container)]/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--md-primary)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Architecture Sentinel
            </p>
            <h1 className="font-display mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--md-on-surface)] sm:text-5xl lg:text-[3.25rem]">
              See how software is built, connected, and exposed
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--md-on-surface-variant)] sm:text-lg">
              Investigate repositories locally: reconstruct architecture, trace data across trust
              boundaries, and review STRIDE, OWASP, MITRE ATLAS, data, and infrastructure risk —
              with file-level evidence, not generic scores.
            </p>
            <p className="mt-4 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-200/90">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Static analysis does not prove a system is secure. Use findings as review input, then
              verify in runtime tests.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/workspace" className="home-cta-primary" data-testid="home-open-workspace">
                Open workspace
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/providers" className="home-cta-secondary">
                <KeyRound className="h-4 w-4" aria-hidden />
                Set up vault & providers
              </Link>
            </div>
          </div>

          <div className="home-hero-visual relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
            <div className="home-graph-panel rounded-2xl border border-white/10 bg-[var(--md-surface-container-high)]/60 p-5 shadow-2xl backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-[var(--md-on-surface-variant)]">
                <span>Live model</span>
                <span className="text-[var(--color-neon-green)]">Indexed</span>
              </div>
              <svg viewBox="0 0 320 220" className="h-auto w-full" role="img" aria-label="Abstract architecture graph">
                <defs>
                  <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <rect x="8" y="8" width="304" height="204" rx="12" fill="none" stroke="currentColor" strokeOpacity="0.12" />
                <circle cx="160" cy="36" r="14" fill="#3b82f6" fillOpacity="0.35" stroke="#3b82f6" />
                <text x="160" y="40" textAnchor="middle" fill="currentColor" fontSize="8" opacity="0.7">
                  API
                </text>
                <circle cx="80" cy="110" r="12" fill="#10b981" fillOpacity="0.3" stroke="#10b981" />
                <circle cx="240" cy="110" r="12" fill="#ec4899" fillOpacity="0.3" stroke="#ec4899" />
                <circle cx="160" cy="180" r="12" fill="#8b5cf6" fillOpacity="0.3" stroke="#8b5cf6" />
                <line x1="160" y1="50" x2="80" y2="98" stroke="url(#edgeGrad)" strokeWidth="2" />
                <line x1="160" y1="50" x2="240" y2="98" stroke="url(#edgeGrad)" strokeWidth="2" />
                <line x1="80" y1="122" x2="160" y2="168" stroke="url(#edgeGrad)" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="240" y1="122" x2="160" y2="168" stroke="url(#edgeGrad)" strokeWidth="1.5" strokeDasharray="4 3" />
                <rect x="24" y="168" width="88" height="28" rx="6" fill="#f59e0b" fillOpacity="0.15" stroke="#f59e0b" strokeOpacity="0.5" />
                <text x="68" y="186" textAnchor="middle" fill="currentColor" fontSize="7" opacity="0.75">
                  Trust boundary
                </text>
              </svg>
              <ul className="mt-4 space-y-2 text-xs text-[var(--md-on-surface-variant)]">
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-neon-blue)]" />
                  12 components mapped
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-neon-pink)]" />
                  3 cross-boundary flows
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-neon-green)]" />
                  Evidence linked to paths
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Analysis workflow">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-[var(--md-on-surface-variant)]">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl border border-[var(--md-outline)]/20 bg-[var(--md-surface-container)]/50 px-5 py-4"
              >
                <span className="font-display text-2xl font-bold leading-none text-[var(--md-primary)]/50">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <StepIcon className="h-4 w-4 text-[var(--md-primary)]" aria-hidden />
                    <p className="font-semibold text-[var(--md-on-surface)]">{step.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{step.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <HomeFeatureCard title="Browser analysis" icon={Zap} accentClass="bg-[var(--color-neon-green)]">
          <ul className="space-y-2">
            <li>Fetch public GitHub trees or upload a ZIP — processed in-tab.</li>
            <li>Static graph extraction plus optional AI investigation with budgets.</li>
            <li>Progress stops when the tab closes; reports can persist in IndexedDB.</li>
            <li>Direct model calls from this browser for OpenAI, Anthropic, Gemini, DeepSeek, and a confirmed custom endpoint.</li>
          </ul>
        </HomeFeatureCard>
        <HomeFeatureCard title="Deep runner" icon={Workflow} accentClass="bg-[var(--color-neon-purple)]">
          <ul className="space-y-2">
            <li>Node CLI shares the same analysis core as this UI.</li>
            <li>Run manually via GitHub Actions with repository secrets.</li>
            <li>Import JSON artifacts back into the workspace for review.</li>
            <li>Job backend adapter reserved for future authenticated runners.</li>
          </ul>
        </HomeFeatureCard>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--md-primary)]/25 bg-gradient-to-br from-[var(--md-primary-container)]/40 to-[var(--md-surface-container)] p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--md-surface-container-high)] text-[var(--md-primary)] shadow-md">
              <LockKeyhole className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
                Encrypted credentials vault
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--md-on-surface-variant)]">
                API keys are encrypted with AES-GCM (PBKDF2-derived keys) and stored as ciphertext in
                sessionStorage for this tab. Unlock the vault before any AI investigation, complete a
                connection test, and confirm snippet transmission.
              </p>
            </div>
          </div>
          <Link to="/providers" className="home-cta-secondary shrink-0 self-start sm:self-center">
            <Bot className="h-4 w-4" aria-hidden />
            Configure providers
          </Link>
        </div>
      </section>
    </div>
  );
}
