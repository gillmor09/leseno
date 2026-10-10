"use client";

/**
 * Keeps the Roman admin shell usable if the heavy Export panel chunk fails.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ExportPanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ExportPanelErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="space-y-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <p className="text-sm font-extrabold text-amber-950">
            Export-Panel konnte nicht geladen werden.
          </p>
          <p className="text-sm font-semibold text-amber-900">
            {this.state.error.message || "Unbekannter Fehler"}
          </p>
          <button
            type="button"
            className="rounded-full bg-amber-900 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Seite neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
