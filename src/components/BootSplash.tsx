import { useEffect, useRef, useState } from "react";
import { InixLogo } from "./InixLogo";

const MIN_DISPLAY_MS = 1500;
const EXIT_MS = 520;

interface BootSplashProps {
  ready: boolean;
  onFinish: () => void;
  statusText?: string;
  waitingForUpdate?: boolean;
}

export function BootSplash({ ready, onFinish, statusText, waitingForUpdate }: BootSplashProps) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");
  const mountTime = useRef(Date.now());
  const finished = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPhase("hold"), 480);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || finished.current) return;

    const elapsed = Date.now() - mountTime.current;
    const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);

    const exitTimer = window.setTimeout(() => {
      setPhase("exit");
      window.setTimeout(() => {
        if (finished.current) return;
        finished.current = true;
        onFinish();
      }, EXIT_MS);
    }, wait);

    return () => window.clearTimeout(exitTimer);
  }, [ready, onFinish]);

  return (
    <div
      className={`boot-splash boot-splash-${phase}${waitingForUpdate ? " boot-splash-waiting-update" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Inix is starting"
    >
      <div className="boot-splash-ambient" aria-hidden />
      <div className="boot-splash-grid" aria-hidden />

      <div className="boot-splash-core">
        <div className="boot-splash-logo-wrap">
          <div className="boot-splash-ring" aria-hidden />
          <div className="boot-splash-ring boot-splash-ring-delay" aria-hidden />
          <div className="boot-splash-glow" aria-hidden />
          <InixLogo height={56} className="boot-splash-logo" />
        </div>

        <p className="boot-splash-wordmark">Inix</p>
        <p className="boot-splash-tagline">Private browsing, rebuilt</p>
      </div>

      <div className="boot-splash-footer">
        <div className="boot-splash-progress" aria-hidden>
          <div className="boot-splash-progress-bar" />
        </div>
        <p className="boot-splash-status">{statusText ?? (ready ? "Almost ready" : "Starting up")}</p>
      </div>
    </div>
  );
}
