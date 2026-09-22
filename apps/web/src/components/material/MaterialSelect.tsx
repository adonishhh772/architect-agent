import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface MaterialSelectOption {
  value: string;
  label: string;
}

interface MaterialSelectProps {
  label: string;
  value: string;
  options: MaterialSelectOption[];
  onChange: (value: string) => void;
  testId?: string;
}

export function MaterialSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: MaterialSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleToggle = (): void => {
    setOpen((current) => !current);
  };

  const handleSelect = (nextValue: string): void => {
    onChange(nextValue);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Escape") {
      setOpen(false);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
    if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      const currentIndex = options.findIndex((option) => option.value === value);
      const next = options[Math.min(options.length - 1, currentIndex + 1)];
      if (next) {
        onChange(next.value);
      }
    }
    if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      const currentIndex = options.findIndex((option) => option.value === value);
      const next = options[Math.max(0, currentIndex - 1)];
      if (next) {
        onChange(next.value);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--md-on-surface-variant)]">
        {label}
      </span>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--md-outline)] bg-[var(--md-surface-container)] px-3 py-2.5 text-left text-sm text-[var(--md-on-surface)] outline-none transition focus:border-[var(--md-primary)] focus:ring-2 focus:ring-[var(--md-primary)]/25"
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown
          className={clsx("h-4 w-4 text-[var(--md-on-surface-variant)] transition", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--md-outline)] bg-[var(--md-surface-container-high)] py-1 shadow-lg"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={clsx(
                    "w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--md-primary-container)]",
                    active
                      ? "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]"
                      : "text-[var(--md-on-surface)]",
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
