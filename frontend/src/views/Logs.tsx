import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { logs as logsModel } from "../../wailsjs/go/models";
import type { LogLine } from "../lib/types";
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime";
import { useDebounced } from "../lib/hooks";
import { timeWithMs } from "../lib/format";
import { Badge, Button, Empty, SearchInput, Segmented, Tooltip, useToast } from "../components/ui";
import { IconCopy, IconLogs, IconPause, IconPlay, IconTrash } from "../components/ui/icons";

type Line = LogLine;
type Level = "all" | "error" | "warn" | "info";

const MAX_LINES = 5000;
const STREAM_ID = "viewer";

export function Logs() {
  const toast = useToast();
  const [sources, setSources] = useState<logsModel.Source[]>([]);
  const [source, setSource] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState<Level>("all");
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 140);
  const [follow, setFollow] = useState(true);
  const buffer = useRef<Line[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    api.LogSources().then((s) => {
      setSources(s);
      if (s.length) setSource(s[0].id);
    }).catch(() => {});
  }, []);

  // Incoming batches land in a ref and are drained on a timer: React never
  // re-renders faster than four times a second regardless of log volume.
  useEffect(() => {
    EventsOn("logs:lines", (id: string, batch: Line[]) => {
      if (id !== STREAM_ID || pausedRef.current) return;
      buffer.current.push(...batch);
    });
    const drain = setInterval(() => {
      if (buffer.current.length === 0) return;
      const incoming = buffer.current;
      buffer.current = [];
      setLines((prev) => {
        const next = prev.concat(incoming);
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    }, 250);
    return () => {
      EventsOff("logs:lines");
      clearInterval(drain);
    };
  }, []);

  const start = useCallback((id: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    setLines([]);
    buffer.current = [];
    api.LogStart(STREAM_ID, src).catch((e) => toast(`Cannot read ${src.label}: ${String(e)}`, "danger"));
  }, [sources, toast]);

  useEffect(() => {
    if (source) start(source);
    return () => {
      void api.LogStop(STREAM_ID);
    };
  }, [source, start]);

  const filtered = useMemo(() => {
    let out = lines;
    if (level !== "all") out = out.filter((l) => l.level === level || (level === "warn" && l.level === "error"));
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((l) => l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q));
    }
    return out.length > 1500 ? out.slice(out.length - 1500) : out;
  }, [lines, level, search]);

  useEffect(() => {
    if (follow && !paused) {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [filtered, follow, paused]);

  const counts = useMemo(() => ({
    error: lines.filter((l) => l.level === "error").length,
    warn: lines.filter((l) => l.level === "warn").length,
  }), [lines]);

  const copyAll = () => {
    navigator.clipboard.writeText(filtered.map((l) => `${timeWithMs(l.time)} ${l.source} ${l.message}`).join("\n"));
    toast(`Copied ${filtered.length} lines`, "ok");
  };

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Logs</h1>
        <span className="view__meta num">
          {filtered.length.toLocaleString()} lines
          {counts.error > 0 && <span className="lvl-error"> · {counts.error} error{counts.error > 1 ? "s" : ""}</span>}
          {counts.warn > 0 && <span className="lvl-warn"> · {counts.warn} warning{counts.warn > 1 ? "s" : ""}</span>}
        </span>
        <div className="view__tools">
          <select className="select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Log source">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <Segmented
            value={level}
            options={[
              { value: "all", label: "All" },
              { value: "error", label: "Errors" },
              { value: "warn", label: "Warn+" },
              { value: "info", label: "Info" },
            ]}
            onChange={setLevel}
          />
          <SearchInput value={query} onValue={setQuery} placeholder="Search log" />
          <Tooltip content={paused ? "Resume streaming" : "Pause streaming"}>
            <Button size="sm" variant={paused ? "primary" : "default"} icon={paused ? <IconPlay size={11} /> : <IconPause size={11} />} onClick={() => setPaused((p) => !p)}>
              {paused ? "Paused" : "Live"}
            </Button>
          </Tooltip>
          <Tooltip content="Copy visible lines"><Button size="sm" variant="ghost" icon={<IconCopy size={12} />} onClick={copyAll} aria-label="Copy" /></Tooltip>
          <Tooltip content="Clear"><Button size="sm" variant="ghost" icon={<IconTrash size={12} />} onClick={() => setLines([])} aria-label="Clear" /></Tooltip>
        </div>
      </header>

      {sources.length === 0 ? (
        <Empty
          icon={<IconLogs size={15} />}
          title="No log sources available"
          text="deck streams the systemd journal and Docker container output. Neither journalctl nor docker was found on this machine."
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon={<IconLogs size={15} />}
          title={search || level !== "all" ? "No lines match" : "Waiting for output"}
          text={search || level !== "all"
            ? "Adjust the search or severity filter to see more."
            : "Lines will stream in as the selected source writes them."}
          action={(search || level !== "all") ? <Button size="sm" onClick={() => { setQuery(""); setLevel("all"); }}>Reset filters</Button> : undefined}
        />
      ) : (
        <div
          className="log-list"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
          }}
        >
          {filtered.map((l, i) => (
            <div className="log-line" data-level={l.level} key={`${l.time}-${i}`}>
              <span className="log-line__time">{timeWithMs(l.time)}</span>
              <span className={`log-line__level lvl-${l.level}`}>{l.level}</span>
              <span className="log-line__source" title={l.source}>{l.source}</span>
              <span className="log-line__msg">{highlight(l.message, search)}</span>
            </div>
          ))}
        </div>
      )}

      {!follow && filtered.length > 0 && (
        <div style={{ position: "absolute", right: 24, bottom: 52 }}>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setFollow(true);
              const el = listRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
          >
            Jump to latest
          </Button>
        </div>
      )}

      <div className="toolbar" style={{ borderTop: "1px solid var(--line)", borderBottom: 0, height: 30 }}>
        <Badge tone={paused ? "warn" : "ok"}>{paused ? "paused" : "streaming"}</Badge>
        <span className="toolbar__count">{sources.find((s) => s.id === source)?.label}</span>
        <span className="spacer" />
        <span className="toolbar__count">{follow ? "following" : "scrolled back"} · buffer {lines.length.toLocaleString()}/{MAX_LINES.toLocaleString()}</span>
      </div>
    </div>
  );
}

/** Wraps search hits so long lines stay scannable. */
function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="log-hit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
