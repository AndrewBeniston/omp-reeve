import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cx, ui } from "@/lib/ui";
import primitiveStyles from "./primitives.module.css";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  tone?: "neutral" | "primary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  tone = "neutral",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cx(ui("button", { tone, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
    >
      {loading ? <span className={primitiveStyles.loadingIndicator} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
});
