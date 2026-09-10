import {
  forwardRef,
  type ReactNode,
} from "react";
import { Button, type ButtonProps } from "../ui/Button";
import styles from "./shell.module.css";

export type TopPanel = "summary" | null;

type HeaderActionProps = Omit<ButtonProps, "size" | "tone">;

export const HeaderAction = forwardRef<HTMLButtonElement, HeaderActionProps>(
  function HeaderAction({ className, type = "button", ...props }, ref) {
    return (
      <Button
        {...props}
        ref={ref}
        type={type}
        size="sm"
        tone="ghost"
        className={className ? `${styles.headerAction} ${className}` : styles.headerAction}
      />
    );
  },
);

interface AppHeaderProps {
  activeTopPanel: TopPanel;
  children: ReactNode;
  panels?: ReactNode;
}

export const AppHeader = forwardRef<HTMLDivElement, AppHeaderProps>(function AppHeader({
  activeTopPanel,
  children,
  panels,
}, ref) {
  return (
    <header className={styles.header}>
      <div
        ref={ref}
        className={styles.headerBar}
        data-summary-open={activeTopPanel === "summary"}
      >
        {children}
      </div>
      {panels}
    </header>
  );
});
