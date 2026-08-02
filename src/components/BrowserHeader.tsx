import { TabBar } from "./TabBar";
import { InixLogo } from "./InixLogo";
import {
  IconLibrary,
  IconPanic,
  IconSettings,
} from "./chrome/ChromeIcons";
import type { ComponentProps } from "react";

type TabBarProps = ComponentProps<typeof TabBar>;

interface BrowserHeaderProps extends TabBarProps {
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onPanic?: () => void;
  privateWindow?: boolean;
}

export function BrowserHeader({
  onOpenSettings,
  onOpenLibrary,
  onPanic,
  privateWindow,
  ...tabProps
}: BrowserHeaderProps) {
  return (
    <header className="browser-header">
      <div className="browser-header-brand">
        <InixLogo height={20} className="browser-header-logo" />
        {privateWindow && <span className="browser-header-private">Private</span>}
      </div>

      <TabBar {...tabProps} embedded />

      <div className="browser-header-tools">
        {!privateWindow && onPanic && (
          <button
            type="button"
            className="chrome-icon-btn"
            onClick={onPanic}
            title="Switch view (Ctrl+Shift+P)"
            aria-label="Switch view"
          >
            <IconPanic size={15} />
          </button>
        )}
        <button
          type="button"
          className="chrome-icon-btn"
          onClick={onOpenLibrary}
          title="Inix Library"
          aria-label="Library"
        >
          <IconLibrary size={15} />
        </button>
        <button
          type="button"
          className="chrome-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <IconSettings size={15} />
        </button>
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="win-btn"
          onClick={() => window.inix?.window.minimize()}
          aria-label="Minimize"
        >
          <span aria-hidden="true">─</span>
        </button>
        <button
          type="button"
          className="win-btn"
          onClick={() => window.inix?.window.maximize()}
          aria-label="Maximize"
        >
          <span aria-hidden="true">□</span>
        </button>
        <button
          type="button"
          className="win-btn win-btn-close"
          onClick={() => window.inix?.window.close()}
          aria-label="Close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </header>
  );
}
