import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";

interface MaterialTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  leadingIcon?: ReactNode;
  allowReveal?: boolean;
}

export function MaterialTextField({
  label,
  helperText,
  leadingIcon,
  allowReveal = false,
  className,
  id,
  type = "text",
  ...rest
}: MaterialTextFieldProps): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const isPassword = type === "password";
  const inputType = isPassword && allowReveal && revealed ? "text" : type;

  const handleToggleReveal = (): void => {
    setRevealed((current) => !current);
  };

  return (
    <label className="block w-full" htmlFor={fieldId}>
      <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--md-on-surface-variant)]">
        {label}
      </span>
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-[var(--md-on-surface-variant)]">
            {leadingIcon}
          </span>
        )}
        <input
          id={fieldId}
          type={inputType}
          className={clsx(
            "w-full rounded-xl border border-[var(--md-outline)] bg-[var(--md-surface-container)] px-3 py-2.5 text-sm text-[var(--md-on-surface)] outline-none transition focus:border-[var(--md-primary)] focus:ring-2 focus:ring-[var(--md-primary)]/25 disabled:cursor-not-allowed disabled:opacity-60",
            leadingIcon && "pl-10",
            isPassword && allowReveal && "pr-10",
            className,
          )}
          {...rest}
        />
        {isPassword && allowReveal && !rest.disabled && (
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--md-on-surface-variant)] transition hover:bg-[var(--md-primary-container)]/40 hover:text-[var(--md-on-surface)]"
            onClick={handleToggleReveal}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>
      {helperText && (
        <span className="mt-1 block text-xs text-[var(--md-on-surface-variant)]">{helperText}</span>
      )}
    </label>
  );
}
