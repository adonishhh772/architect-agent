import {
  CheckCircle2,
  FileUp,
  GitBranch,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHero } from "../../components/layout/PageHero";
import { PageSection } from "../../components/layout/PageSection";
import { parseImportedReportJson, saveReportLocally } from "../persistence/indexedDbStore";
import { ImportDropzone } from "./ImportDropzone";

const IMPORT_STEPS = [
  {
    icon: GitBranch,
    title: "Run Deep Runner",
    detail: "Trigger the GitHub Actions workflow and download the JSON artifact.",
  },
  {
    icon: ShieldCheck,
    title: "Validate & sanitize",
    detail: "Zod schema checks structure; sensitive fields are never persisted.",
  },
  {
    icon: LayoutDashboard,
    title: "Review in workspace",
    detail: "Open maps, findings, and exports from your local IndexedDB copy.",
  },
] as const;

export function ImportReportPage(): JSX.Element {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImportFile = async (file: File): Promise<void> => {
    setIsImporting(true);
    setMessage(null);
    setError(null);
    try {
      const text = await file.text();
      const report = parseImportedReportJson(text);
      await saveReportLocally(report);
      setMessage(`Imported report ${report.id.slice(0, 8)}… Saved locally. Opening workspace…`);
      navigate("/workspace");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import validation failed.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="page-shell mx-auto max-w-4xl space-y-8 pb-10">
      <PageHero
        icon={FileUp}
        eyebrow="Deep Runner import"
        title="Bring offline analysis into the browser"
        description="Upload JSON produced by the CLI or GitHub Actions workflow. Reports are validated, sanitized, and stored in IndexedDB on this device — never committed to GitHub Pages."
      />

      <ol className="grid gap-4 md:grid-cols-3">
        {IMPORT_STEPS.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <li
              key={step.title}
              className="rounded-2xl border border-[var(--md-outline)]/20 bg-[var(--md-surface-container)]/60 px-5 py-4"
            >
              <span className="font-display text-2xl font-bold text-[var(--md-primary)]/45">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="mt-2 flex items-center gap-2">
                <StepIcon className="h-4 w-4 text-[var(--md-primary)]" aria-hidden />
                <p className="font-semibold text-[var(--md-on-surface)]">{step.title}</p>
              </div>
              <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{step.detail}</p>
            </li>
          );
        })}
      </ol>

      <PageSection
        title="Import report file"
        description="Only import artifacts you trust. Malformed files are rejected."
        icon={FileUp}
      >
        <ImportDropzone onFileSelected={handleImportFile} disabled={isImporting} />
        {isImporting && (
          <p className="mt-4 text-sm text-[var(--md-on-surface-variant)]">Validating and saving…</p>
        )}
        {message && (
          <p
            className="mt-4 flex items-center gap-2 text-sm text-[var(--color-neon-green)]"
            data-testid="import-message"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm text-[var(--color-neon-pink)]" role="alert">
            {error}
          </p>
        )}
      </PageSection>

      <section className="rounded-2xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container)]/50 px-6 py-5">
        <p className="text-sm text-[var(--md-on-surface-variant)]">
          No artifact yet? Run analysis in the{" "}
          <Link to="/workspace" className="text-[var(--md-primary)] underline">
            workspace
          </Link>{" "}
          or configure{" "}
          <Link to="/providers" className="text-[var(--md-primary)] underline">
            providers
          </Link>{" "}
          for Deep Runner credentials.
        </p>
      </section>
    </div>
  );
}
