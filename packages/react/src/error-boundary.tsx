import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** When true, log caught errors to the console (provider debug flag). */
  debug?: boolean;
};

type State = {
  hasError: boolean;
};

/**
 * Internal error boundary for the UserVane React surface.
 * A render throw inside the provider subtree must never reach the host tree
 * (PRODUCT-DESIGN [R2]).
 */
export class UserVaneErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.debug) {
      // eslint-disable-next-line no-console
      console.error("[UserVane] render error caught by boundary", error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
