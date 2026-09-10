import type { HTMLAttributes, ReactNode } from "react";
import { cx, ui } from "@/lib/ui";
import primitiveStyles from "./primitives.module.css";

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "style"> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
}

export function StatusBadge({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span {...props} className={cx(ui("statusBadge", { tone }), className)}>
      {icon ? <span className={primitiveStyles.statusIcon} aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
