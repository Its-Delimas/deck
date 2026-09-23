import { Component, type ErrorInfo, type ReactNode } from "react";
import { LogError } from "../../../wailsjs/runtime/runtime";

type State = { error: Error | null; stack: string };

/**
 * Renders a readable failure instead of an empty window, and forwards the
 * error to the Go process so it also lands in the application log.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? "" });
    report(`${error.message}\n${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const text = `${error.message}\n\n${error.stack ?? ""}\n${stack}`;
    return (
      <div className="crash">
        <div className="crash__box">
          <div className="crash__title">deck could not render this screen</div>
          <p className="crash__text">
            An unexpected error stopped the interface. The details below are also written to the
            application log.
          </p>
          <pre className="crash__trace">{text}</pre>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--primary" onClick={() => location.reload()}>Reload</button>
            <button className="btn" onClick={() => navigator.clipboard.writeText(text)}>Copy details</button>
          </div>
        </div>
      </div>
    );
  }
}

/** Sends a message to the Go log, falling back to the console in a browser. */
export function report(message: string) {
  try {
    LogError(`[ui] ${message}`);
  } catch {
    console.error(message);
  }
}
