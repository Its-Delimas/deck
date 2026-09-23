import { useCallback } from "react";
import * as api from "../../../wailsjs/go/main/App";

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/**
 * The window is frameless, so deck provides its own resize edges. Geometry is
 * read once on press and then written on each frame of the drag.
 */
export function Grips() {
  const start = useCallback((edge: Edge) => async (e: React.MouseEvent) => {
    e.preventDefault();
    const g = await api.GetGeometry();
    const x0 = e.screenX;
    const y0 = e.screenY;
    let frame = 0;

    const move = (ev: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const dx = ev.screenX - x0;
        const dy = ev.screenY - y0;
        let { x, y, w, h } = g;
        if (edge.includes("e")) w = Math.max(940, g.w + dx);
        if (edge.includes("s")) h = Math.max(620, g.h + dy);
        if (edge.includes("w")) {
          const width = Math.max(940, g.w - dx);
          x = g.x + (g.w - width);
          w = width;
        }
        if (edge.includes("n")) {
          const height = Math.max(620, g.h - dy);
          y = g.y + (g.h - height);
          h = height;
        }
        api.SetGeometry({ x, y, w, h } as never);
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  return (
    <>
      {EDGES.map((edge) => (
        <div key={edge} className={`grip grip--${edge}`} onMouseDown={start(edge)} />
      ))}
    </>
  );
}
