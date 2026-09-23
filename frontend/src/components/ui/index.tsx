// Shared primitives. Every screen composes these; no screen styles its own
// buttons, badges or panels.
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from "react";
import { IconCheck, IconSearch } from "./icons";

type Tone = "default" | "ok" | "warn" | "danger" | "info" | "accent";

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: ReactNode;
  busy?: boolean;
};

export function Button({ variant = "default", size = "md", icon, busy, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn ${variant !== "default" ? `btn--${variant}` : ""} ${size === "sm" ? "btn--sm" : ""} ${busy ? "btn--busy" : ""} ${className}`}
      {...rest}
    >
      {busy ? <span className="spinner" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <Tooltip content={label}>
      <button type="button" className="iconbtn" data-active={active} aria-label={label} {...rest}>
        {children}
      </button>
    </Tooltip>
  );
}

/* ---------- Badge, Dot, Kbd ---------- */

export function Badge({ tone = "default", mono, children }: { tone?: Tone; mono?: boolean; children: ReactNode }) {
  return <span className={`badge ${tone !== "default" ? `badge--${tone}` : ""} ${mono ? "badge--mono" : ""}`}>{children}</span>;
}

export function Dot({ tone = "default", pulse }: { tone?: Tone; pulse?: boolean }) {
  return <span className={`dot ${tone !== "default" ? `dot--${tone}` : ""} ${pulse ? "dot--pulse" : ""}`} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ---------- Panel ---------- */

export function Panel({
  title, subtitle, actions, children, pad, className = "", style,
}: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode;
  pad?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${pad ? "panel--pad" : "panel--flush"} ${className}`} style={style}>
      {(title || actions) && (
        <header className="panel__head">
          {title && <h2 className="panel__title">{title}</h2>}
          {subtitle && <span className="panel__sub">{subtitle}</span>}
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

/* ---------- Inputs ---------- */

export function SearchInput({ value, onValue, placeholder = "Search", shortcut, inputRef, ...rest }:
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "ref"> & {
    value: string; onValue: (v: string) => void; shortcut?: string;
    inputRef?: React.Ref<HTMLInputElement>;
  }) {
  return (
    <label className="input" style={{ minWidth: 180 }}>
      <IconSearch size={13} />
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onValue(e.target.value)}
        {...rest}
      />
      {shortcut && !value && <Kbd>{shortcut}</Kbd>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" data-on={checked} onClick={() => onChange(!checked)} />
  );
}

export function Tabs<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; badge?: ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.badge != null && <span className="dim num" style={{ marginLeft: 5 }}>{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Meter ---------- */

export function Meter({ value, tone, large }: { value: number; tone?: "ok" | "warn" | "danger"; large?: boolean }) {
  return (
    <div className={`meter ${tone ? `meter--${tone}` : ""} ${large ? "meter--lg" : ""}`} role="progressbar" aria-valuenow={Math.round(value)}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* ---------- Tooltip ---------- */

export function Tooltip({ content, children, delay = 280 }: { content: ReactNode; children: ReactNode; delay?: number }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 }), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!content) return <>{children}</>;
  return (
    <span onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} style={{ display: "contents" }}>
      {children}
      {pos && <TipBody x={pos.x} y={pos.y}>{content}</TipBody>}
    </span>
  );
}

function TipBody({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Keep the tip inside the window on both axes.
    let left = x - rect.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - rect.width - 6));
    let top = y;
    if (top + rect.height > window.innerHeight - 6) top = y - rect.height - 20;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);
  return <div ref={ref} className="tip" role="tooltip" style={{ left: x, top: y }}>{children}</div>;
}

/* ---------- Dialog ---------- */

export function Dialog({ open, title, children, onClose, footer, width }: {
  open: boolean; title: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true"
        style={width ? { width: `min(${width}px, calc(100vw - 48px))` } : undefined}>
        <div className="dialog__head">{title}</div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </>
  );
}

/* ---------- Context menu ---------- */

export type MenuItem =
  | { type: "item"; label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean; hint?: string }
  | { type: "separator" }
  | { type: "label"; label: string };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  }, [x, y]);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((item, i) => {
        if (item.type === "separator") return <hr key={i} />;
        if (item.type === "label") return <div key={i} className="menu__label">{item.label}</div>;
        return (
          <button key={i} data-danger={item.danger} disabled={item.disabled}
            onClick={() => { item.onSelect(); onClose(); }}>
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.hint && <span className="spacer" />}
            {item.hint && <span className="dim mono" style={{ fontSize: "var(--fs-xs)" }}>{item.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Hook wiring right-click to a positioned menu. */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);
  const node = state ? <ContextMenu {...state} onClose={() => setState(null)} /> : null;
  return { open, node };
}

/* ---------- Empty & feedback ---------- */

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <div className="empty__title">{title}</div>
      {text && <p className="empty__text">{text}</p>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

/* ---------- Toasts ---------- */

type Toast = { id: number; message: string; tone: Tone };
const ToastCtx = createContext<(message: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = "default") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role="status">
            {t.tone === "ok" && <IconCheck size={13} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
