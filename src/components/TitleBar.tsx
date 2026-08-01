import { InixLogo } from "./InixLogo";

interface TitleBarProps {
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onPanic?: () => void;
  privateWindow?: boolean;
}

export function TitleBar({ onOpenSettings, onOpenLibrary, onPanic, privateWindow }: TitleBarProps) {
  return (
    <header className="title-bar">
      <div className="title-bar-brand">
        <InixLogo height={22} className="brand-logo" />
        {privateWindow && <span className="title-private-badge">Private window</span>}
      </div>
      <div className="title-bar-actions">
        {!privateWindow && onPanic && (
          <button
            type="button"
            className="title-panic-btn"
            onClick={onPanic}
            title="Ctrl+Shift+P"
            aria-label="Switch view"
          >
            ◐
          </button>
        )}
        <button className="title-library-btn" onClick={onOpenLibrary} title="Inix Library">
          ★
        </button>
        <button className="title-settings-btn" onClick={onOpenSettings} title="Settings">
          ⚙
        </button>
        <div className="window-controls">
          <button className="win-btn" onClick={() => window.inix?.window.minimize()} aria-label="Minimize">
            ─
          </button>
          <button className="win-btn" onClick={() => window.inix?.window.maximize()} aria-label="Maximize">
            □
          </button>
          <button className="win-btn win-btn-close" onClick={() => window.inix?.window.close()} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
    </header>
  );
}
