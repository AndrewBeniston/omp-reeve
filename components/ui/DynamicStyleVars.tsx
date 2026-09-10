import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { cx, ui } from "@/lib/ui";

const DYNAMIC_STYLE_VARIABLES = [
  "--ui-panel-width",
  "--ui-composer-height",
  "--ui-scroll-offset",
  "--ui-tree-depth",
  "--ui-progress",
  "--ui-minimap-offset",
  "--ui-preview-aspect-ratio",
  "--ui-animation-origin-x",
  "--ui-animation-origin-y",
  "--ui-title-shift",
  "--ui-title-shift-em",
  "--ui-hover-card-left",
  "--ui-hover-card-top",
  "--ui-queue-translate-x",
  "--ui-queue-translate-y",
  "--ui-queue-transition",
  "--ui-project-translate-x",
  "--ui-project-translate-y",
  "--ui-project-transition",
  "--ui-response-spacer-height",
] as const;

export type DynamicStyleVariable = (typeof DYNAMIC_STYLE_VARIABLES)[number];

const ALLOWED_VARIABLES = new Set<string>(DYNAMIC_STYLE_VARIABLES);

export interface DynamicStyleVarsProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  variables: Partial<Record<DynamicStyleVariable, string | number>>;
  elementRef?: Ref<HTMLDivElement>;
}

export function DynamicStyleVars({ variables, className, elementRef, ...props }: DynamicStyleVarsProps) {
  // Static CSS cannot know measured geometry, scroll positions, or progress values.
  const style: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(variables)) {
    if (!ALLOWED_VARIABLES.has(name)) {
      throw new Error(`Unsupported dynamic style variable: ${name}`);
    }
    if (value !== undefined) style[name] = value;
  }

  return (
    <div
      {...props}
      ref={elementRef}
      className={cx(ui("dynamicStyleVars"), className)}
      style={style as CSSProperties}
    />
  );
}
