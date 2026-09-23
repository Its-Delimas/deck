// Types for payloads that arrive over events rather than through a bound
// method, so the Wails model generator never sees them.
export type LogLine = {
  time: number;
  level: "error" | "warn" | "info" | "debug";
  source: string;
  message: string;
  stream: string;
};
