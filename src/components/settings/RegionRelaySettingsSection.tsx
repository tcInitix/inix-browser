import { useCallback, useEffect, useState } from "react";
import { Switch } from "../Switch";
import type { RelayMode, RelayState } from "../../inix.d";

export function RegionRelaySettingsSection() {
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
  const [customUrl, setCustomUrl] = useState("");
  const [connectOnStartup, setConnectOnStartup] = useState(false);
  const [mode, setMode] = useState<RelayMode>("inix-tx");

  const refresh = useCallback(async () => {
    const next = await window.inix?.relay.getStatus();
    if (next) setState(next);
    const formatted = await window.inix?.settings.getFormatted();
    if (formatted) {
      setCustomUrl(formatted.relay_custom_url ?? "");
      setConnectOnStartup(formatted.relay_connect_on_startup ?? false);
      setMode(formatted.relay_mode === "custom" ? "custom" : "inix-tx");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return window.inix?.relay.onStatus(setState);
  }, [refresh]);

  const applyMode = async (nextMode: RelayMode) => {
    setMode(nextMode);
    const result = await window.inix?.relay.setMode(
      nextMode,
      nextMode === "custom" ? customUrl : undefined
    );
    if (result) setState(result);
  };

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2>Region relay</h2>
          <p>
            Route Inix browsing through a US exit node (Opera-style browser relay). This protects Inix
            tabs only — not other apps on your PC.
          </p>
        </div>
      </div>

      <Switch
        className="settings-toggle"
        checked={state.enabled}
        disabled={state.status === "connecting"}
        onChange={(enabled) => {
          void window.inix?.relay.setEnabled(enabled).then((s) => s && setState(s));
        }}
        label="Use region relay"
      />

      <p className="settings-note">
        Status: <strong>{state.status}</strong>
        {state.exitIp ? ` · Exit IP ${state.exitIp}` : ""}
        {state.error ? ` · ${state.error}` : ""}
      </p>

      <label className="settings-field">
        <span>Relay source</span>
        <select
          className="settings-select"
          value={mode}
          onChange={(e) => void applyMode(e.target.value as RelayMode)}
        >
          <option value="inix-tx">Inix US (Texas) preset</option>
          <option value="custom">Custom SOCKS5 proxy</option>
        </select>
      </label>

      {mode === "custom" && (
        <label className="settings-field">
          <span>Custom proxy URL</span>
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onBlur={() => void applyMode("custom")}
            placeholder="socks5://user:pass@host:1080"
          />
        </label>
      )}

      <Switch
        className="settings-toggle"
        checked={connectOnStartup}
        onChange={(enabled) => {
          setConnectOnStartup(enabled);
          void window.inix?.relay.setConnectOnStartup(enabled);
        }}
        label="Connect relay on startup"
      />

      <div className="settings-action-row">
        <button type="button" className="settings-secondary-btn" onClick={() => void refresh()}>
          Refresh status
        </button>
        <button
          type="button"
          className="settings-secondary-btn"
          onClick={() => void window.inix?.relay.test().then((s) => s && setState(s))}
        >
          Test connection
        </button>
      </div>

      <p className="settings-note">
        Configure the Inix Texas preset with environment variables before launch:{" "}
        <code>INIX_RELAY_HOST</code>, <code>INIX_RELAY_PORT</code>, <code>INIX_RELAY_USER</code>,{" "}
        <code>INIX_RELAY_PASS</code>. See <code>scripts/setup-inix-relay.sh</code> to provision a VPS.
      </p>

      <p className="settings-note">
        Regional blocks based on your account or cookies may still apply. WebRTC is restricted while the
        relay is connected to reduce IP leaks.
      </p>
    </section>
  );
}
