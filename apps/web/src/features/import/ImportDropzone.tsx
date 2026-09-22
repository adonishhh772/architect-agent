import { FileJson, Upload } from "lucide-react";
import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

interface ImportDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function ImportDropzone({ onFileSelected, disabled }: ImportDropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleActivate = (): void => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="import-dropzone"
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--md-outline)]/50 bg-[var(--md-surface-container-high)]/40 px-6 py-12 text-center transition duration-200 hover:border-[var(--md-primary)]/50 hover:bg-[var(--md-primary-container)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-primary)]"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        data-testid="import-report-input"
        className="sr-only"
        disabled={disabled}
        onChange={handleChange}
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--md-primary-container)]/60 text-[var(--md-primary)] transition group-hover:scale-105">
        <Upload className="h-7 w-7" aria-hidden />
      </span>
      <p className="font-display mt-4 text-lg font-semibold text-[var(--md-on-surface)]">
        Drop report JSON or click to browse
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm text-[var(--md-on-surface-variant)]">
        <FileJson className="h-4 w-4" aria-hidden />
        Deep Runner artifact · schema validated · secrets stripped
      </p>
    </div>
  );
}
