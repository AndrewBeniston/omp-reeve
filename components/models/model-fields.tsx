"use client";

import { useEffect, useState } from "react";
import { SearchableSelect } from "../SearchableSelect";
import { IconButton } from "../ui/IconButton";
import { useI18n } from "@/hooks/useI18n";
import { cx } from "@/lib/ui";
import styles from "./model-fields.module.css";

/**
 * Field controls shared by the provider panel and the model panel.
 *
 * FormField owns the label, the description and the ARIA wiring, so each
 * control here only has to accept the identity properties FormField clones in.
 */
export interface FieldControlProps {
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
}

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.fieldGroupLabel}>{label}</div>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className={styles.sectionTitle}>{children}</div>;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className={styles.fieldHint}>{children}</span>;
}

export function TextInput({ value, onChange, placeholder, mono, className, ...fieldProps }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  className?: string;
} & FieldControlProps) {
  return (
    <input
      {...fieldProps}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cx(styles.textInput, mono && styles.textInputMono, className)}
    />
  );
}

export function SecretTextInput({
  value,
  onChange,
  placeholder,
  mono,
  onKeyDown,
  autoComplete = "off",
  spellCheck = false,
  className,
  ...fieldProps
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  autoComplete?: string;
  spellCheck?: boolean;
  className?: string;
} & FieldControlProps) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);

  return (
    <div className={cx(styles.secretInputWrapper, className)}>
      <input
        {...fieldProps}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cx(styles.secretInput, mono && styles.textInputMono)}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
      />
      <IconButton
        label={visible ? t("i18n.hideDetails") : t("i18n.showDetails")}
        size="sm"
        onClick={() => setVisible((v) => !v)}
        className={styles.secretVisibilityButton}
      >
        {visible ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12a18.45 18.45 0 0 1 5.06-6.94" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </IconButton>
    </div>
  );
}

export function NumInput({ value, onChange, placeholder, className, ...fieldProps }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
} & FieldControlProps) {
  return (
    <input
      {...fieldProps}
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cx(styles.textInput, className)}
    />
  );
}

export function ApiSelect({ value, onChange, options, required, ...fieldProps }: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  required?: boolean;
} & FieldControlProps) {
  const { t } = useI18n();
  return (
    <SearchableSelect
      {...fieldProps}
      value={value}
      onChange={onChange}
      options={[
        ...(!required ? [{ value: "", label: `— ${t("i18n.default")} / none —` }] : []),
        ...options.map((option) => ({ value: option, label: option })),
      ]}
    />
  );
}

export function Check({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.checkboxLabel}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={styles.checkboxInput}
      />
      {label}
    </label>
  );
}
