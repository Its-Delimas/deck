// Hand-rolled 16px icon set. One stroke weight, one grid, no dependency — the
// whole set costs less than pulling in an icon package.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 15, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Svg {...p}><path d="M2 9.5h3.5v4H2zM6.5 2.5H10v11H6.5zM11 6.5h3v7h-3z" /></Svg>
);
export const IconProcesses = (p: P) => (
  <Svg {...p}><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M2.5 6h11M6 6v7.5" /></Svg>
);
export const IconNetwork = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.6 1.7 2.4 3.6 2.4 5.5S9.6 12.3 8 13.5C6.4 12.3 5.6 10.4 5.6 8S6.4 4.2 8 2.5z" /></Svg>
);
export const IconStorage = (p: P) => (
  <Svg {...p}><ellipse cx="8" cy="4" rx="5.5" ry="2" /><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" /></Svg>
);
export const IconServices = (p: P) => (
  <Svg {...p}><rect x="2" y="2.5" width="12" height="4.5" rx="1.2" /><rect x="2" y="9" width="12" height="4.5" rx="1.2" /><path d="M4.5 4.75h.01M4.5 11.25h.01" /></Svg>
);
export const IconTerminal = (p: P) => (
  <Svg {...p}><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" /><path d="M4.6 6.4 6.6 8l-2 1.6M8.4 10h3" /></Svg>
);
export const IconLogs = (p: P) => (
  <Svg {...p}><path d="M3 2.5h7L13 5.5v8H3z" /><path d="M9.5 2.6V5.6H12.9M5.3 8.4h5.4M5.3 10.8h3.6" /></Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="2.1" /><path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7 3.5 3.5" /></Svg>
);
export const IconProject = (p: P) => (
  <Svg {...p}><path d="M2 4.2c0-.9.7-1.6 1.6-1.6h2.3l1.4 1.7h5.1c.9 0 1.6.7 1.6 1.6v5.9c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6z" /></Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="7.2" cy="7.2" r="4.4" /><path d="m10.5 10.6 3 3" /></Svg>
);
export const IconClose = (p: P) => <Svg {...p}><path d="m4 4 8 8M12 4l-8 8" /></Svg>;
export const IconMinus = (p: P) => <Svg {...p}><path d="M3.5 8h9" /></Svg>;
export const IconMaximise = (p: P) => <Svg {...p}><rect x="3.5" y="3.5" width="9" height="9" rx="1.2" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m6.2 3.8 4.2 4.2-4.2 4.2" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m3.8 6.2 4.2 4.2 4.2-4.2" /></Svg>;
export const IconChevronUp = (p: P) => <Svg {...p}><path d="m3.8 9.8 4.2-4.2 4.2 4.2" /></Svg>;
export const IconArrowDown = (p: P) => <Svg {...p}><path d="M8 3v10M4.4 9.4 8 13l3.6-3.6" /></Svg>;
export const IconArrowUp = (p: P) => <Svg {...p}><path d="M8 13V3M4.4 6.6 8 3l3.6 3.6" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p}><path d="M5 3.4 12.2 8 5 12.6z" fill="currentColor" /></Svg>;
export const IconStop = (p: P) => <Svg {...p}><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2" fill="currentColor" /></Svg>;
export const IconPause = (p: P) => (
  <Svg {...p}><rect x="4.3" y="3.6" width="2.4" height="8.8" rx="0.8" fill="currentColor" /><rect x="9.3" y="3.6" width="2.4" height="8.8" rx="0.8" fill="currentColor" /></Svg>
);
export const IconRestart = (p: P) => (
  <Svg {...p}><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13.2 2.4v2.9h-2.9" /></Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M3 4.4h10M6.4 4.4V3.1h3.2v1.3M4.4 4.4l.6 8.3h6l.6-8.3" /></Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M13.4 7a5.5 5.5 0 0 0-9.7-2.3M2.6 9a5.5 5.5 0 0 0 9.7 2.3" /><path d="M13.6 2.8v2.6H11M2.4 13.2v-2.6H5" /></Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}><path d="M9.2 3.2h3.6v3.6M12.6 3.4 7.8 8.2" /><path d="M12 9.6v2.8c0 .7-.5 1.2-1.2 1.2H3.8c-.7 0-1.2-.5-1.2-1.2V5.2C2.6 4.5 3.1 4 3.8 4h2.8" /></Svg>
);
export const IconGit = (p: P) => (
  <Svg {...p}><circle cx="4.4" cy="3.8" r="1.7" /><circle cx="4.4" cy="12.2" r="1.7" /><circle cx="11.6" cy="6.2" r="1.7" /><path d="M4.4 5.5v5M11.6 7.9c0 2.2-1.8 2.9-3.6 3.1-1.3.2-3.6.6-3.6 1.2" /></Svg>
);
export const IconFolder = (p: P) => (
  <Svg {...p}><path d="M2 4.4c0-.8.6-1.4 1.4-1.4h2.4l1.4 1.8h5.4c.8 0 1.4.6 1.4 1.4v5.4c0 .8-.6 1.4-1.4 1.4H3.4c-.8 0-1.4-.6-1.4-1.4z" /></Svg>
);
export const IconFile = (p: P) => (
  <Svg {...p}><path d="M3.4 2.6h5.2l3.4 3.4v7.4H3.4z" /><path d="M8.4 2.7v3.4h3.4" /></Svg>
);
export const IconCpu = (p: P) => (
  <Svg {...p}><rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.2" /><path d="M6.4 1.8v2.8M9.6 1.8v2.8M6.4 11.4v2.8M9.6 11.4v2.8M1.8 6.4h2.8M1.8 9.6h2.8M11.4 6.4h2.8M11.4 9.6h2.8" /></Svg>
);
export const IconMemory = (p: P) => (
  <Svg {...p}><rect x="1.8" y="4.4" width="12.4" height="7.2" rx="1.2" /><path d="M4.6 7v2.4M7.2 7v2.4M9.8 7v2.4M12.2 7v2.4" /></Svg>
);
export const IconGpu = (p: P) => (
  <Svg {...p}><rect x="1.8" y="4" width="12.4" height="8" rx="1.4" /><circle cx="6" cy="8" r="1.9" /><path d="M10.4 6.6h2.2M10.4 9.4h2.2" /></Svg>
);
export const IconThermo = (p: P) => (
  <Svg {...p}><path d="M6.4 8.9V3.7a1.6 1.6 0 1 1 3.2 0v5.2a3 3 0 1 1-3.2 0z" /></Svg>
);
export const IconDatabase = IconStorage;
export const IconContainer = (p: P) => (
  <Svg {...p}><path d="M8 1.9 14 5v6l-6 3.1L2 11V5z" /><path d="M2 5l6 3.1L14 5M8 8.1v6" /></Svg>
);
export const IconCommand = (p: P) => (
  <Svg {...p}><path d="M5.4 2.6a1.8 1.8 0 1 0 1.8 1.8v7.2a1.8 1.8 0 1 0 1.8-1.8H4.4a1.8 1.8 0 1 0 1.8 1.8V4.4a1.8 1.8 0 1 0-1.8 1.8h7.2a1.8 1.8 0 1 0-1.8-1.8" /></Svg>
);
export const IconFilter = (p: P) => <Svg {...p}><path d="M2.4 3.6h11.2L9.4 8.4v4.2l-2.8 1.3V8.4z" /></Svg>;
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="5.6" y="5.6" width="8" height="8" rx="1.3" /><path d="M10.4 5.6V3.7c0-.7-.6-1.3-1.3-1.3H3.7c-.7 0-1.3.6-1.3 1.3v5.4c0 .7.6 1.3 1.3 1.3h1.9" /></Svg>
);
export const IconCheck = (p: P) => <Svg {...p}><path d="m3.4 8.4 3 3 6.2-6.8" /></Svg>;
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M8 2.6 14.4 13H1.6z" /><path d="M8 6.6v3M8 11.4h.01" /></Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.8" /><path d="M8 7.3v3.6M8 5.2h.01" /></Svg>
);
export const IconPlus = (p: P) => <Svg {...p}><path d="M8 3.4v9.2M3.4 8h9.2" /></Svg>;
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.8" /><path d="M8 4.8V8l2.2 1.6" /></Svg>
);
export const IconLayers = (p: P) => (
  <Svg {...p}><path d="m8 2.2 5.8 3-5.8 3-5.8-3z" /><path d="m2.2 8.6 5.8 3 5.8-3" /></Svg>
);
