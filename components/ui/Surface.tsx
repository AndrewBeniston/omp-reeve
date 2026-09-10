import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cx, ui } from "@/lib/ui";

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  tone?: "canvas" | "main" | "sidebar" | "surface" | "elevated" | "inset";
  border?: "none" | "default" | "strong";
  radius?: "none" | "sm" | "md" | "lg" | "card";
  elevation?: "none" | "raised";
  padding?: "none" | "sm" | "md" | "lg";
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface({
  tone = "surface",
  border = "default",
  radius = "md",
  elevation = "none",
  padding = "none",
  className,
  ...props
}, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className={cx(ui("surface", { tone, border, radius, elevation, padding }), className)}
    />
  );
});
