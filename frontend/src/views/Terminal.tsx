import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as api from "../../wailsjs/go/main/App";
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime";
import { useApp } from "../lib/app";
import { basename } from "../lib/format";
import { Button, Tooltip, useToast } from "../components/ui";
import { IconClose, IconCopy, IconPlus, IconTrash } from "../components/ui/icons";

type Session = { id: string; title: string; dir: string };

/** A real PTY, not a simulated prompt: the shell runs in Go and xterm renders it. */
export function Terminal() {
  const { project, host } = useApp();
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<string>("");
  const hostRef = useRef<HTMLDivElement>(null);
  const terms = useRef(new Map<string, { term: XTerm; fit: FitAddon; el: HTMLDivElement }>());
  const counter = useRef(0);

  // xterm needs literal colours, so the palette is derived from the active
  // theme rather than hardcoded: a light interface gets a light terminal.
  const theme = useCallback(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const light = document.documentElement.dataset.theme === "light";
    const ansi = light
      ? {
          black: "#2b3038", red: "#c4292d", green: "#12794f", yellow: "#8a6100",
          blue: "#0a5fd0", magenta: "#8a3ecf", cyan: "#00807a", white: "#e6e8ec",
          brightBlack: "#6b7280", brightRed: "#e04447", brightGreen: "#17915e",
          brightYellow: "#a37500", brightBlue: "#2b74e0", brightMagenta: "#9c54e0",
          brightCyan: "#0a938c", brightWhite: "#ffffff",
        }
      : {
          black: "#1a1e25", red: "#f2585b", green: "#3ecf8e", yellow: "#e3b341",
          blue: "#58a6ff", magenta: "#b98bff", cyan: "#2dd4bf", white: "#c9cedb",
          brightBlack: "#4a515c", brightRed: "#ff7b7e", brightGreen: "#5ee3a6",
          brightYellow: "#f0ca6a", brightBlue: "#7cb9ff", brightMagenta: "#cba6ff",
          brightCyan: "#5fe3d3", brightWhite: "#ffffff",
        };
    const accent = v("--accent", "#6e7bff");
    return {
      background: v("--term-bg", light ? "#ffffff" : "#07080a"),
      foreground: v("--fg", light ? "#12151a" : "#e7e9ee"),
      cursor: accent,
      cursorAccent: v("--term-bg", light ? "#ffffff" : "#07080a"),
      selectionBackground: v("--accent-soft", "rgba(110,123,255,0.28)"),
      ...ansi,
    };
  }, []);

  const spawn = useCallback((dir: string) => {
    counter.current += 1;
    const id = `t${Date.now()}${counter.current}`;
    const el = document.createElement("div");
    el.style.height = "100%";
    const term = new XTerm({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 6000,
      theme: theme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    terms.current.set(id, { term, fit, el });
    setSessions((s) => [...s, { id, title: dir ? basename(dir) : "shell", dir }]);
    setActive(id);
    term.onData((data) => api.TermWrite(id, data));
    queueMicrotask(() => {
      const mount = hostRef.current;
      if (!mount) return;
      mount.appendChild(el);
      term.open(el);
      fit.fit();
      api.TermStart(id, dir, term.cols, term.rows).catch((e) => toast(String(e), "danger"));
    });
    return id;
  }, [theme, toast]);

  // One session is opened on first mount, in the active project when there is one.
  useEffect(() => {
    if (sessions.length === 0) spawn(project?.path ?? host?.home ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = theme();
      for (const { term } of terms.current.values()) term.options.theme = next;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent"] });
    return () => observer.disconnect();
  }, [theme]);

  useEffect(() => {
    EventsOn("term:data", (id: string, data: string) => {
      terms.current.get(id)?.term.write(data);
    });
    EventsOn("term:exit", (id: string) => {
      terms.current.get(id)?.term.writeln("\r\n\x1b[38;5;244m[process exited]\x1b[0m");
    });
    return () => {
      EventsOff("term:data");
      EventsOff("term:exit");
    };
  }, []);

  // Only the active session is in the DOM; the rest keep their scrollback.
  useEffect(() => {
    const mount = hostRef.current;
    if (!mount) return;
    for (const [id, t] of terms.current) {
      t.el.style.display = id === active ? "block" : "none";
    }
    const current = terms.current.get(active);
    if (current && mount.clientWidth > 0) {
      current.fit.fit();
      current.term.focus();
      api.TermResize(active, current.term.cols, current.term.rows);
    }
  }, [active, sessions]);

  useEffect(() => {
    const onResize = () => {
      const current = terms.current.get(active);
      // The view stays mounted while hidden; fitting a zero-sized element
      // would hand the PTY nonsense dimensions.
      if (!current || !hostRef.current?.clientWidth) return;
      current.fit.fit();
      api.TermResize(active, current.term.cols, current.term.rows);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (hostRef.current) ro.observe(hostRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [active]);

  const close = (id: string) => {
    api.TermClose(id);
    const entry = terms.current.get(id);
    entry?.term.dispose();
    entry?.el.remove();
    terms.current.delete(id);
    setSessions((s) => {
      const next = s.filter((x) => x.id !== id);
      if (id === active) setActive(next[next.length - 1]?.id ?? "");
      return next;
    });
  };

  useEffect(() => () => {
    for (const [id, t] of terms.current) {
      api.TermClose(id);
      t.term.dispose();
    }
    terms.current.clear();
  }, []);

  const copySelection = () => {
    const text = terms.current.get(active)?.term.getSelection();
    if (text) {
      navigator.clipboard.writeText(text);
      toast("Copied selection", "ok");
    }
  };

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Terminal</h1>
        <span className="view__meta mono">{sessions.find((s) => s.id === active)?.dir || host?.home}</span>
        <div className="view__tools">
          <Tooltip content="Copy selection"><Button size="sm" variant="ghost" icon={<IconCopy size={12} />} onClick={copySelection} aria-label="Copy" /></Tooltip>
          <Tooltip content="Clear scrollback">
            <Button size="sm" variant="ghost" icon={<IconTrash size={12} />} onClick={() => terms.current.get(active)?.term.clear()} aria-label="Clear" />
          </Tooltip>
          {project && (
            <Button size="sm" onClick={() => spawn(project.path)}>New in {project.name}</Button>
          )}
        </div>
      </header>

      <div className="term-wrap">
        <div className="term-tabs">
          {sessions.map((s) => (
            <button key={s.id} className="term-tab" data-active={s.id === active} onClick={() => setActive(s.id)}>
              <span className="truncate" style={{ maxWidth: 140 }}>{s.title}</span>
              <span
                className="iconbtn"
                style={{ width: 14, height: 14 }}
                onClick={(e) => { e.stopPropagation(); close(s.id); }}
                role="button"
                aria-label={`Close ${s.title}`}
              >
                <IconClose size={9} />
              </span>
            </button>
          ))}
          <Tooltip content="New session">
            <button className="iconbtn" onClick={() => spawn(project?.path ?? host?.home ?? "")} aria-label="New session">
              <IconPlus size={12} />
            </button>
          </Tooltip>
        </div>
        <div className="term-host" ref={hostRef} onClick={() => terms.current.get(active)?.term.focus()} />
      </div>
    </div>
  );
}
