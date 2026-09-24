import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { nextOpenSection } from "./reportAccordionState";

export interface ReportAccordionItem {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
}

interface ReportAccordionProps {
  items: ReportAccordionItem[];
  openSectionId: string;
  onOpenSectionChange: (sectionId: string) => void;
}

export function ReportAccordion({
  items,
  openSectionId,
  onOpenSectionChange,
}: ReportAccordionProps): JSX.Element {
  return (
    <div className="space-y-3" data-testid="report-accordion">
      {items.map((item) => (
        <ReportAccordionSection
          key={item.id}
          item={item}
          open={item.id === openSectionId}
          onOpenSectionChange={onOpenSectionChange}
        />
      ))}
    </div>
  );
}

interface ReportAccordionSectionProps {
  item: ReportAccordionItem;
  open: boolean;
  onOpenSectionChange: (sectionId: string) => void;
}

function ReportAccordionSection({
  item,
  open,
  onOpenSectionChange,
}: ReportAccordionSectionProps): JSX.Element {
  const handleToggle = (): void => {
    onOpenSectionChange(nextOpenSection(open ? item.id : "", item.id));
  };

  return (
    <section
      className={`md-elevated-card overflow-hidden transition ${
        open
          ? "border-[var(--md-primary)]/50 bg-[var(--md-surface-container)] shadow-lg"
          : "border-[var(--md-outline)]/20 bg-[var(--md-surface-container)]/70"
      }`}
      data-testid={`accordion-${item.id}`}
    >
      <h2>
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 px-1 py-1 text-left"
          aria-expanded={open}
          data-testid={`accordion-toggle-${item.id}`}
          onClick={handleToggle}
        >
          <span>
            <span className="block font-display text-xl font-semibold text-[var(--md-on-surface)]">{item.title}</span>
            {item.description && (
              <span className="mt-1 block text-sm text-[var(--md-on-surface-variant)]">{item.description}</span>
            )}
          </span>
          <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-[var(--md-primary)] transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h2>
      {open && <div className="mt-4">{item.content}</div>}
    </section>
  );
}
