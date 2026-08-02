import { useEffect, useRef, useState } from "react";
import { Switch } from "./Switch";
import type { RelayState } from "../inix.d";

interface RelayPopoverProps {
  open: boolean;
  state: RelayState;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onOpenSettings?: (section?: string) => void;
}

export function RelayPopover({ open, state, onClose, onToggle, onOpenSettings }: RelayPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const openSettings = (section?: string) => {
    onClose();
    onOpenSettings?.(section);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const busy = state.status === "connecting";
  const connected = state.status === "connected";
  const errored = state.status === "error";

  let statusLine = "Region relay is off.";
  if (busy) statusLine = "Connecting to relay…";
  else if (connected) statusLine = "Protected in Inix only — not a full device VPN.";
  else if (errored) statusLine = state.error ?? "Connection failed.";
  else if (state.enabled) statusLine = "Waiting to connect…";

  return (
    <div className="relay-popover" ref={panelRef} role="dialog" aria-label="Inix Region Relay">
      <header className="relay-popover-header">
        <h3>Inix Region Relay</h3>
        <p>Routes browsing through a US server. Browser only.</p>
      </header>

      <Switch
        className="relay-popover-toggle"
        checked={state.enabled}
        disabled={busy}
        onChange={onToggle}
        label={state.enabled ? "Relay on" : "Relay off"}
      />

      <dl className="relay-popover-meta">
        <div>
          <dt>Region</dt>
          <dd>{state.region || "—"}</dd>
        </div>
        <div>
          <dt>Exit IP</dt>
          <dd>{state.exitIp ?? (busy ? "Checking…" : "—")}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={`relay-popover-status relay-popover-status-${state.status}`}>
            {state.status}
          </dd>
        </div>
      </dl>

      <p className="relay-popover-note">{statusLine}</p>

      {!state.configured && (
        <p className="relay-popover-warn">
          No relay server configured. Set <code>INIX_RELAY_*</code> environment variables or add a custom
          proxy in{" "}
          {onOpenSettings ? (
            <button type="button" className="relay-popover-inline-link" onClick={() => openSettings("relay")}>
              Settings
            </button>
          ) : (
            "Settings"
          )}
          .
        </p>
      )}

      <p className="relay-popover-tip">
        If a site still blocks you, try a private window — some blocks use your account, not just IP.
      </p>

      {onOpenSettings && (
        <button type="button" className="relay-popover-settings-link" onClick={() => openSettings("relay")}>
          Relay settings…
        </button>
      )}
    </div>
  );
}

interface RelayBadgeProps {
  state: RelayState;
  open: boolean;
  onClick: () => void;
}

export function RelayBadge({ state, open, onClick }: RelayBadgeProps) {
  const active = state.status === "connected";
  const busy = state.status === "connecting";
  const errored = state.status === "error";

  const title = active
    ? `Region relay on — ${state.region}${state.exitIp ? ` (${state.exitIp})` : ""}`
    : errored
      ? `Region relay error — ${state.error ?? "failed"}`
      : busy
        ? "Connecting region relay…"
        : "Region relay off";

  return (
    <button
      type="button"
      className={`relay-badge${active ? " is-active" : ""}${busy ? " is-busy" : ""}${errored ? " is-error" : ""}${open ? " is-open" : ""}`}
      title={title}
      aria-label={title}
      aria-expanded={open}
      onClick={onClick}
    >
      <span className="relay-badge-icon" aria-hidden="true">
        {busy ? "◌" : "⛨"}
      </span>
    </button>
  );
}

export function useRelayState(): [RelayState, (enabled: boolean) => void] {
  const [state, setState] = useState<RelayState>({
    status: "off",
    enabled: false,
    mode: "off",
    region: "",
    label: "",
    exitIp: null,
    error: null,
    configured: false,
  });

  useEffect(() => {
    void window.inix?.relay.getStatus().then(setState);
    return window.inix?.relay.onStatus(setState);
  }, []);

  const setEnabled = (enabled: boolean) => {
    void window.inix?.relay.setEnabled(enabled).then(setState);
  };

  return [state, setEnabled];
}
