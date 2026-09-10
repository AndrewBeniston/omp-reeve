import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, ui } from "@/lib/ui";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed" | "style"> {
  label: string;
  tone?: "neutral" | "primary" | "danger";
  size?: "sm" | "md" | "touch";
  /**
   * Set this property only on a toggle control.
   * An unset value keeps the button free of aria-pressed.
   */
  pressed?: boolean | "mixed";
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label,
  tone = "neutral",
  size = "sm",
  pressed,
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
      className={cx(ui("iconButton", { tone, size, pressed }), className)}
      aria-label={label}
      aria-pressed={pressed}
      title={props.title ?? label}
    >
      {children}
    </button>
  );
});
