"use client";

import { useId, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx, ui } from "@/lib/ui";
import primitiveStyles from "./primitives.module.css";

export interface DisclosureProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  label: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  density?: "compact" | "default";
}

export function Disclosure({
  label,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  density = "default",
  className,
  children,
  ...props
}: DisclosureProps) {
  const generatedId = useId();
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? internalExpanded;
  const triggerId = `${generatedId}-trigger`;
  const panelId = `${generatedId}-panel`;

  const toggle = () => {
    const next = !isExpanded;
    if (expanded === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <div {...props} className={cx(ui("disclosure", { density }), className)}>
      <button
        id={triggerId}
        type="button"
        className={ui("disclosureTrigger", { expanded: isExpanded })}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className={primitiveStyles.disclosureMarker} aria-hidden="true">›</span>
        <span>{label}</span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
        className={ui("disclosurePanel", { expanded: isExpanded })}
      >
        <div className={primitiveStyles.disclosureContent}>{children}</div>
      </div>
    </div>
  );
}
