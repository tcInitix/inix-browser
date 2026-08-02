import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

const defaults = { size: 16, className: undefined as string | undefined };

function svg(props: IconProps & { children: ReactNode; viewBox?: string }) {
  const { size = 16, className, children, viewBox = "0 0 24 24" } = { ...defaults, ...props };
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconBack(p: IconProps) {
  return svg({ ...p, children: <path d="M15 18l-6-6 6-6" /> });
}

export function IconForward(p: IconProps) {
  return svg({ ...p, children: <path d="M9 18l6-6-6-6" /> });
}

export function IconReload(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <path d="M21 12a9 9 0 11-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </>
    ),
  });
}

export function IconHome(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
      </>
    ),
  });
}

export function IconBookmark(p: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = p;
  return (
    <svg
      width={rest.size ?? 16}
      height={rest.size ?? 16}
      viewBox="0 0 24 24"
      className={rest.className}
      aria-hidden="true"
    >
      <path
        d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDownload(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <path d="M12 3v12" />
        <path d="M8 11l4 4 4-4" />
        <path d="M4 20h16" />
      </>
    ),
  });
}

export function IconSparkle(p: IconProps) {
  return (
    <svg
      width={p.size ?? 16}
      height={p.size ?? 16}
      viewBox="0 0 24 24"
      className={p.className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2zm7 9l.8 2.6L22 14l-2.2.4L19 17l-.8-2.6L16 14l2.2-.4L19 11zM5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15z" />
    </svg>
  );
}

export function IconSearch(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" />
      </>
    ),
  });
}

export function IconLibrary(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <path d="M4 5h5v14H4z" />
        <path d="M11 3h5v16h-5z" />
        <path d="M18 7h2v12h-2z" />
      </>
    ),
  });
}

export function IconSettings(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </>
    ),
  });
}

export function IconPanic(p: IconProps) {
  return (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" className={p.className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.35" />
      <path d="M12 3v18" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3a9 9 0 019 9" fill="var(--bg-surface)" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconReader(p: IconProps) {
  return svg({
    ...p,
    children: (
      <>
        <path d="M4 19V5" />
        <path d="M4 5c2 0 4 2 8 2s6-2 8-2v14c-2 0-4-2-8-2s-6 2-8 2z" />
      </>
    ),
  });
}

export function IconPlus(p: IconProps) {
  return svg({ ...p, children: <path d="M12 5v14M5 12h14" /> });
}

export function IconClose(p: IconProps) {
  return svg({ ...p, children: <path d="M6 6l12 12M18 6L6 18" /> });
}
