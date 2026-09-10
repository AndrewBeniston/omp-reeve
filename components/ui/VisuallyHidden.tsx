import type { HTMLAttributes } from "react";
import { cx, ui } from "@/lib/ui";

export type VisuallyHiddenProps = Omit<HTMLAttributes<HTMLSpanElement>, "style">;

export function VisuallyHidden({ className, ...props }: VisuallyHiddenProps) {
  return <span {...props} className={cx(ui("visuallyHidden"), className)} />;
}
