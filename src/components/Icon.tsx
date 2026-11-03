import type { ReactElement } from "react";

const PATHS: Record<string, ReactElement> = {
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  star: (
    <path
      d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  mouth: (
    <>
      <path d="M4 11c2.5-2 5-2.2 8-1 3-1.2 5.5-1 8 1-2 4.5-5 6.5-8 6.5S6 15.5 4 11z" />
      <path d="M4.5 11.2h15" />
    </>
  ),
  nose: (
    <>
      <path d="M12 4.5c-1.2 3.5-3 6.5-4.6 9.2-.9 1.6.2 3.3 2 3.3h5.2c1.8 0 2.9-1.7 2-3.3C15 11 13.2 8 12 4.5z" />
      <path d="M10.3 14.6v.1M13.7 14.6v.1" strokeWidth={2.6} />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 01-10 0z" />
      <path d="M12 16v5" />
    </>
  ),
  unplug: (
    <>
      <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 01-10 0z" />
      <path d="M12 16v5M4 4l16 16" />
    </>
  ),
  hand: (
    <path d="M8 12V6.5a1.5 1.5 0 013 0V11m0-1.5V5a1.5 1.5 0 013 0v5m0-3.5a1.5 1.5 0 013 0V13c0 4-2.5 7-6 7-2.6 0-4-1.3-5.4-3.4L4.3 13.4a1.5 1.5 0 012.5-1.6L8 13.5" />
  ),
  chart: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  wave: <path d="M3 12h2l2-5 3 10 3-12 3 10 2-3h3" />,
  flag: <path d="M6 21V4m0 1h11l-2 4 2 4H6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />,
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
