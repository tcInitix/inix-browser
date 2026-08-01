import type { ReactNode } from "react";

interface DismissibleOverlayProps {
  children: ReactNode;
  /** Click backdrop or pass false to block backdrop dismiss (e.g. onboarding). */
  onDismiss?: () => void;
  /** Backdrop visible but clicks pass through (e.g. download progress). */
  passive?: boolean;
}

export function DismissibleOverlay({ children, onDismiss, passive }: DismissibleOverlayProps) {
  return (
    <div className={`permission-overlay${passive ? " permission-overlay-passive" : ""}`}>
      {onDismiss && !passive ? (
        <button
          type="button"
          className="permission-overlay-backdrop"
          aria-label="Dismiss"
          onClick={onDismiss}
        />
      ) : null}
      {children}
    </div>
  );
}
