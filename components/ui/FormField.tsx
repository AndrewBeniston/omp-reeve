import { cloneElement, isValidElement } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { cx, ui } from "@/lib/ui";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
};

export interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  labelMode?: "htmlFor" | "aria-labelledby";
  children: ReactElement<FieldControlProps>;
}

export function FormField({
  id,
  label,
  description,
  error,
  labelMode = "htmlFor",
  children,
  className,
  ...props
}: FormFieldProps) {
  if (!isValidElement<FieldControlProps>(children)) {
    throw new Error("FormField requires one valid control element");
  }

  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const labelId = `${id}-label`;
  const describedBy = [children.props["aria-describedby"], description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const labelledBy = labelMode === "aria-labelledby"
    ? [children.props["aria-labelledby"], labelId].filter(Boolean).join(" ")
    : children.props["aria-labelledby"];
  const control = cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    "aria-labelledby": labelledBy,
  });

  return (
    <div {...props} className={cx(ui("formField"), className)}>
      {labelMode === "htmlFor"
        ? <label htmlFor={id} className={ui("formLabel")}>{label}</label>
        : <div id={labelId} className={ui("formLabel")}>{label}</div>}
      {description ? <div id={descriptionId} className={ui("formDescription")}>{description}</div> : null}
      {control}
      {error ? <div id={errorId} role="alert" className={ui("formError")}>{error}</div> : null}
    </div>
  );
}
