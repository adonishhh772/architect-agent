import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type MaterialButtonVariant = "filled" | "outlined" | "text";

interface MaterialButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MaterialButtonVariant;
  icon?: ReactNode;
  children: ReactNode;
}

export function MaterialButton({
  variant = "filled",
  icon,
  children,
  className,
  type = "button",
  ...rest
}: MaterialButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-wide transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "filled" &&
          "bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-[0_0_24px_var(--sentinel-glow)] hover:brightness-110 active:scale-[0.98]",
        variant === "outlined" &&
          "border border-[var(--md-outline)] bg-transparent text-[var(--md-primary)] hover:bg-[var(--md-primary-container)]",
        variant === "text" &&
          "bg-transparent text-[var(--md-primary)] hover:bg-[var(--md-primary-container)]",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
