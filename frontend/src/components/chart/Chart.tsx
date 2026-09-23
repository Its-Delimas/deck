// Canvas charts. Drawing imperatively keeps the cost of a live 1Hz update to a
// single fill per series instead of hundreds of SVG nodes.
import { useEffect, useRef, useState } from "react";
import { HISTORY } from "../../lib/store";

export type Series = { data: number[]; color: string; label?: string; fill?: boolean; dashed?: boolean };

type ChartProps = {
  series: Series[];
  height?: number;
  /** Fixed maximum; when omitted the chart scales to the data with headroom. */
  max?: number;
  min?: number;
  grid?: boolean;
  /** Formats the value shown in the hover readout. */
  format?: (v: number) => string;
  times?: number[];
  className?: string;
  capacity?: number;
};

const varCache = new Map<string, string>();

function cssVar(name: string): string {
  let value = varCache.get(name);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    varCache.set(name, value);
  }
  return value;
}

/**
 * Canvas does not understand `var(--x)`, so token colours are resolved to
 * literal values before they touch a 2D context. Results are cached because
 * getComputedStyle is a layout read.
 */
function resolve(color: string): string {
  if (!color.startsWith("var(")) return color;
  const name = color.slice(4, color.lastIndexOf(")")).trim();
  return cssVar(name) || "#8a90a0";
}

/** Appends an alpha channel to a six-digit hex colour. */
function withAlpha(color: string, alpha: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + alpha : null;
}

/** Drops the resolved-colour cache; call when the theme changes. */
export function invalidateChartColors() {
  varCache.clear();
}

export function Chart({
  series, height = 64, max, min = 0, grid = true, format = (v) => v.toFixed(1), times, className = "", capacity = HISTORY,
}: ChartProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;

    const draw = () => {
      const w = box.clientWidth;
      const h = height;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let top = max;
      if (top == null) {
        let peak = 0;
        for (const s of series) for (const v of s.data) if (v > peak) peak = v;
        top = peak <= 0 ? 1 : peak * 1.25;
      }
      const span = Math.max(1e-9, top - min);
      const yOf = (v: number) => h - 1 - ((v - min) / span) * (h - 2);
      const xOf = (i: number) => (i / Math.max(1, capacity - 1)) * w;

      if (grid) {
        ctx.strokeStyle = cssVar("--line-soft") || "#14171d";
        ctx.lineWidth = 1;
        for (let g = 1; g < 4; g++) {
          const y = Math.round((h / 4) * g) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      for (const s of series) {
        const n = s.data.length;
        if (n === 0) continue;
        const color = resolve(s.color);
        const offset = capacity - n;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = xOf(i + offset);
          const y = yOf(s.data[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        if (s.fill !== false) {
          ctx.save();
          ctx.lineTo(xOf(n - 1 + offset), h);
          ctx.lineTo(xOf(offset), h);
          ctx.closePath();
          const top = withAlpha(color, "38");
          const bottom = withAlpha(color, "00");
          if (top && bottom) {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, top);
            grad.addColorStop(1, bottom);
            ctx.fillStyle = grad;
          } else {
            // Non-hex token (a named or rgb() colour): flat wash instead.
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = color;
          }
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x = xOf(i + offset);
            const y = yOf(s.data[i]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.lineJoin = "round";
        if (s.dashed) ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (hover) {
        const longest = series.reduce((m, s) => Math.max(m, s.data.length), 0);
        const offset = capacity - longest;
        const x = xOf(hover.i + offset);
        ctx.strokeStyle = cssVar("--line-strong") || "#262b34";
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
        ctx.stroke();
        for (const s of series) {
          const v = s.data[hover.i];
          if (v == null) continue;
          ctx.fillStyle = resolve(s.color);
          ctx.beginPath();
          ctx.arc(x, yOf(v), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [series, height, max, min, grid, hover, capacity]);

  const longest = series.reduce((m, s) => Math.max(m, s.data.length), 0);

  const onMove = (e: React.MouseEvent) => {
    const box = wrap.current;
    if (!box || longest === 0) return;
    const rect = box.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (capacity - 1)) - (capacity - longest);
    if (idx < 0 || idx >= longest) {
      setHover(null);
      return;
    }
    setHover({ x: e.clientX - rect.left, i: idx });
  };

  return (
    <div ref={wrap} className={`chart ${className}`} style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <canvas ref={canvas} />
      {hover && (
        <div className="chart__readout" style={{ left: Math.min(Math.max(hover.x, 4), (wrap.current?.clientWidth ?? 0) - 4) }}>
          <div className="chart__readout-inner">
            {times?.[hover.i] && <div className="chart__time num">{new Date(times[hover.i]).toTimeString().slice(0, 8)}</div>}
            {series.map((s, i) => (
              <div key={i} className="chart__val">
                <span className="chart__swatch" style={{ background: s.color }} />
                {s.label && <span className="dim">{s.label}</span>}
                <span className="num">{format(s.data[hover.i] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Minimal inline trend line, for table rows and compact metrics. */
export function Sparkline({ data, color, height = 18, width = 60, max }: {
  data: number[]; color: string; height?: number; width?: number; max?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!data.length) return;
    const top = max ?? Math.max(1, ...data) * 1.15;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * width;
      const y = height - 1 - (v / top) * (height - 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = resolve(color);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // `data` is a ring buffer mutated in place, so the last sample is what
    // actually signals a redraw.
  }, [data, data.length, data[data.length - 1], color, height, width, max]);
  return <canvas ref={ref} style={{ width, height, display: "block" }} />;
}

/** Core-utilisation strip: one bar per logical CPU. */
export function CoreBars({ values }: { values: number[] }) {
  return (
    <div className="cores">
      {values.map((v, i) => (
        <div key={i} className="cores__bar" title={`Core ${i} · ${v.toFixed(0)}%`}>
          <span style={{ height: `${Math.max(2, Math.min(100, v))}%`, background: barColor(v) }} />
        </div>
      ))}
    </div>
  );
}

function barColor(v: number): string {
  if (v > 85) return "var(--danger)";
  if (v > 60) return "var(--warn)";
  return "var(--accent)";
}

/** Proportional usage ring used for disks. */
export function Ring({ value, size = 46, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const tone = value > 90 ? "var(--danger)" : value > 75 ? "var(--warn)" : "var(--accent)";
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 300ms var(--ease)" }}
        />
      </svg>
      <span className="ring__label num">{label ?? `${Math.round(value)}%`}</span>
    </div>
  );
}
