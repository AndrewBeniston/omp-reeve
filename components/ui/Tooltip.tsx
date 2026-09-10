"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { cloneElement } from "react";
import { cx, ui } from "@/lib/ui";

export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "content" | "style"> {
  content: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
}

export function Tooltip({ content, children, className, ...props }: TooltipProps) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), 500);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setVisible(false);
  };

  useEffect(() => hide, []);

  const trigger = cloneElement(children, {
    "aria-describedby": visible ? id : children.props["aria-describedby"],
  });

  return (
    <span
      {...props}
      className={cx(ui("tooltip"), className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        aria-hidden={!visible}
        className={ui("tooltipBubble", { visible })}
      >
        {content}
      </span>
    </span>
  );
}
