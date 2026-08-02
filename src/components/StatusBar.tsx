import { useEffect, useState } from "react";
import type { EngineStatus, InixSettings, RelayState } from "../inix.d";

interface StatusBarProps {
  isPrivate: boolean;
  privateLabel?: string;
  zoomLevel?: number;
  frozen?: boolean;
  onOpenSettings?: () => void;
}

function zoomLabel(level: number): string {
  return `${Math.round(Math.pow(1.2, level) * 100)}%`;
}

function historyLabel(mode: InixSettings["history_mode"]): string | null {
  if (mode === "transient") return "Transient history";
  if (mode === "vaulted") return "Vault history";
  return null;
}

function aiLabel(status: EngineStatus | null): string {
  if (!status) return "AI";
  const kind = status.provider === "api" ? "API" : "Local";
  return status.connected ? `AI · ${kind}` : `AI · ${kind} offline`;
}

export function StatusBar({
  isPrivate,
  privateLabel,
  zoomLevel,
  frozen,
  onOpenSettings,
}: StatusBarProps) {
  const [version, setVersion] = useState("");
  const [settings, setSettings] = useState<InixSettings | null>(null);
  const [relay, setRelay] = useState<RelayState | null>(null);
  const [aiStatus, setAiStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    void window.inix?.update.version().then((v) => setVersion(v ?? ""));
    void window.inix?.settings.getFormatted().then((s) => {
      if (s) setSettings(s);
    });
    void window.inix?.relay.getStatus().then((s) => {
      if (s) setRelay(s);
    });
    void window.inix?.ai.getStatus().then((s) => {
      if (s) setAiStatus(s);
    });

    const unsubRelay = window.inix?.relay.onStatus((s) => setRelay(s));
    return () => unsubRelay?.();
  }, []);

  const history = settings ? historyLabel(settings.history_mode) : null;
  const relayActive = relay?.status === "connected";
  const relayLabel = relayActive
    ? relay?.label?.trim() || relay?.region?.trim() || "Relay"
    : null;
  const trackersOn = settings?.tracker_blocking_enabled !== false;
  const zoom =
    zoomLevel != null && zoomLevel !== 0 ? zoomLabel(zoomLevel) : null;

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        {isPrivate && privateLabel && (
          <span className="status-chip status-chip-private">{privateLabel}</span>
        )}

        {isPrivate ? (
          <span className="status-chip status-chip-muted">History not saved</span>
        ) : (
          history && <span className="status-chip status-chip-muted">{history}</span>
        )}

        {trackersOn && (
          <span className="status-chip status-chip-shield">Trackers blocked</span>
        )}

        {settings?.https_only_mode && (
          <span className="status-chip status-chip-muted">HTTPS only</span>
        )}

        {relayActive && relayLabel && (
          <span className="status-chip status-chip-relay">{relayLabel}</span>
        )}

        {frozen && <span className="status-chip status-chip-muted">Tab hibernating</span>}
      </div>

      <div className="status-bar-right">
        <span
          className={`status-chip status-chip-ai${aiStatus?.connected ? " is-online" : ""}`}
          title={aiStatus?.connected ? "Inix AI ready" : "Inix AI unavailable"}
        >
          {aiLabel(aiStatus)}
        </span>

        {zoom && <span className="status-meta">{zoom}</span>}

        {version && (
          <button
            type="button"
            className="status-version"
            onClick={onOpenSettings}
            title="Open settings"
          >
            Inix {version}
          </button>
        )}
      </div>
    </footer>
  );
}
