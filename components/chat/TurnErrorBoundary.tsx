import { Component, type ReactNode } from "react";

import styles from "./turn-error-boundary.module.css";

interface TurnErrorBoundaryProps {
  children: ReactNode;
  title: string;
  retryLabel: string;
}

interface TurnErrorBoundaryState {
  failed: boolean;
}

export class TurnErrorBoundary extends Component<TurnErrorBoundaryProps, TurnErrorBoundaryState> {
  state: TurnErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): TurnErrorBoundaryState {
    return { failed: true };
  }

  private reset = () => {
    this.setState({ failed: false });
  };

  render() {
    if (this.state.failed) {
      return (
        <div className={styles.fallback} role="alert">
          <p className={styles.title}>{this.props.title}</p>
          <button className={styles.retry} type="button" onClick={this.reset}>
            {this.props.retryLabel}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
