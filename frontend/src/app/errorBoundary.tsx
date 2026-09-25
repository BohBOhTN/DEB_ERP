import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "../components/ui/ErrorState/ErrorState.js";
import { fr } from "../i18n/fr.js";

interface State {
  failed: boolean;
}

/// Last line of defence: a render error shows the standard error state with
/// a reload instead of a blank page.
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  public state: State = { failed: false };

  public static getDerivedStateFromError(): State {
    return { failed: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error", error, info.componentStack);
  }

  public render(): ReactNode {
    if (this.state.failed) {
      return (
        <ErrorState
          title={fr.errorTitle}
          description={fr.errorDescription}
          retryLabel={fr.reload}
          onRetry={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
