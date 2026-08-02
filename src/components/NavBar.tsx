import { useState, useEffect, forwardRef, useImperativeHandle, useRef, type FormEvent, type KeyboardEvent } from "react";
import type { Tab } from "../types";
import { isSettingsUrl, isShellUrl } from "../types";
import {
  IconBack,
  IconBookmark,
  IconDownload,
  IconForward,
  IconHome,
  IconReader,
  IconReload,
  IconSearch,
  IconSparkle,
} from "./chrome/ChromeIcons";
import { RelayBadge, RelayPopover, useRelayState } from "./RelayPopover";
import { useChromeOverlay } from "../chrome/ChromeOverlayContext";
import type { SettingsLinkTarget } from "../utils/settings-url";

export const INIX_BOOKMARK_DRAG = "application/x-inix-bookmark";

export interface AddressBarHandle {
  focus: () => void;
}

interface NavBarProps {
  tab: Tab;
  onNavigate: (url: string) => void | Promise<void>;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onOpenSearch: () => void;
  onToggleAI: () => void;
  onToggleBookmark: () => void;
  onOpenDownloads: () => void;
  onReaderMode: () => void;
  bookmarked: boolean;
  aiOpen: boolean;
  onOpenSettings?: (section?: SettingsLinkTarget) => void;
}

export const NavBar = forwardRef<AddressBarHandle, NavBarProps>(function NavBar(
  {
    tab,
    onNavigate,
    onBack,
    onForward,
    onReload,
    onHome,
    onOpenSearch,
    onToggleAI,
    onToggleBookmark,
    onOpenDownloads,
    onReaderMode,
    bookmarked,
    aiOpen,
    onOpenSettings,
  },
  ref
) {
  const [input, setInput] = useState(tab.url);
  const inputRef = useRef<HTMLInputElement>(null);
  const [relayOpen, setRelayOpen] = useState(false);
  const [relayState, setRelayEnabled] = useRelayState();
  const [securityOpen, setSecurityOpen] = useState(false);

  useChromeOverlay("relay-popover", relayOpen);
  useChromeOverlay("security-popover", securityOpen);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  useEffect(() => {
    if (tab.url === "inix://newtab") setInput("");
    else if (isSettingsUrl(tab.url)) setInput(tab.url);
    else if (tab.url === "inix://library") setInput("inix://library");
    else setInput(tab.url);
  }, [tab.url, tab.id]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim().startsWith("/")) {
      onOpenSearch();
      return;
    }
    void onNavigate(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.trim().startsWith("/")) {
        onOpenSearch();
        return;
      }
      void onNavigate(input);
    }
  };

  const showSecure = !isShellUrl(tab.url) && tab.url.startsWith("http");
  const securityState =
    tab.securityState ??
    (tab.url.startsWith("https://") ? "secure" : tab.url.startsWith("http://") ? "insecure" : "unknown");
  const securityTitle =
    tab.securityDetail ??
    (securityState === "secure"
      ? "Connection is secure"
      : securityState === "warning"
        ? "Certificate or security warning"
        : securityState === "insecure"
          ? "Connection is not encrypted"
          : "Security unknown");
  const securityIcon =
    securityState === "secure" ? "🔒" : securityState === "warning" ? "⚠" : securityState === "insecure" ? "⚠" : "○";

  const canDragSite = !isShellUrl(tab.url) && tab.url.startsWith("http");

  let siteHost = "";
  let siteProtocol = "";
  try {
    const parsed = new URL(tab.url);
    siteHost = parsed.hostname;
    siteProtocol = parsed.protocol;
  } catch {
    // ignore
  }

  return (
    <nav className="nav-bar">
      <div className="nav-group nav-group-travel">
        <button className="nav-btn" disabled={!tab.canGoBack} title="Back" onClick={onBack}>
          <IconBack size={15} />
        </button>
        <button className="nav-btn" disabled={!tab.canGoForward} title="Forward" onClick={onForward}>
          <IconForward size={15} />
        </button>
        <button className="nav-btn" title="Reload" onClick={onReload}>
          <IconReload size={15} />
        </button>
        <button className="nav-btn" title="Home (Alt+Home)" onClick={onHome}>
          <IconHome size={15} />
        </button>
      </div>

      <div className="address-form-wrap">
        <RelayBadge
          state={relayState}
          open={relayOpen}
          onClick={() => setRelayOpen((o) => !o)}
        />
        <RelayPopover
          open={relayOpen}
          state={relayState}
          onClose={() => setRelayOpen(false)}
          onToggle={setRelayEnabled}
          onOpenSettings={
            onOpenSettings
              ? () => {
                  setRelayOpen(false);
                  onOpenSettings("relay");
                }
              : undefined
          }
        />
        <form className="address-form" onSubmit={handleSubmit}>
          {canDragSite && (
            <div
              className="address-site-chip"
              draggable
              title="Drag to bookmarks bar to save"
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  INIX_BOOKMARK_DRAG,
                  JSON.stringify({ url: tab.url, title: tab.title, tabId: tab.id })
                );
                e.dataTransfer.effectAllowed = "copy";
                if (tab.favicon) {
                  const img = new Image();
                  img.src = tab.favicon;
                  e.dataTransfer.setDragImage(img, 8, 8);
                }
              }}
            >
              {tab.favicon ? (
                <img src={tab.favicon} alt="" className="address-site-chip-icon" />
              ) : (
                <span className="address-site-chip-icon address-site-chip-globe">◉</span>
              )}
              {showSecure && (
                <button
                  type="button"
                  className={`address-site-chip-lock ${securityState}`}
                  title={securityTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSecurityOpen((v) => !v);
                  }}
                  aria-label={`Security: ${securityState}`}
                >
                  {securityIcon}
                </button>
              )}
              {securityOpen && (
                <>
                  <div className="security-popover-backdrop" onClick={() => setSecurityOpen(false)} />
                  <div className="security-popover" role="dialog" aria-label="Connection security">
                    <div className={`security-popover-header ${securityState}`}>
                      <span className="security-popover-icon">{securityIcon}</span>
                      <div>
                        <strong>
                          {securityState === "secure"
                            ? "Connection is secure"
                            : securityState === "warning"
                              ? "Certificate issue"
                              : securityState === "insecure"
                                ? "Not secure"
                                : "Security unknown"}
                        </strong>
                        {siteHost && <div className="security-popover-host">{siteHost}</div>}
                      </div>
                    </div>
                    <p className="security-popover-body">
                      {securityState === "secure"
                        ? "Your information (for example, passwords or credit card numbers) is encrypted when sent to this site."
                        : securityState === "warning"
                          ? tab.securityDetail ?? "The site's certificate has an issue. Proceed with caution."
                          : securityState === "insecure"
                            ? "This site uses an unencrypted HTTP connection. Attackers on the network may see or modify anything you send or receive."
                            : "Inix does not yet have security info for this page."}
                    </p>
                    <div className="security-popover-meta">
                      <div>
                        <span>Protocol</span>
                        <strong>{siteProtocol.replace(":", "").toUpperCase() || "—"}</strong>
                      </div>
                    </div>
                    {onOpenSettings && (
                      <div className="security-popover-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setSecurityOpen(false);
                            onOpenSettings("privacy");
                          }}
                        >
                          Site settings
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button type="button" className="address-search-btn" title="Inix Search (/)" onClick={onOpenSearch}>
            <IconSearch size={15} />
          </button>
          <input
            ref={inputRef}
            className="address-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or enter address · / for history"
            spellCheck={false}
          />
        </form>
      </div>

      <div className="nav-group nav-group-page">
        <button
          className={`nav-btn${bookmarked ? " nav-btn-active" : ""}`}
          title={bookmarked ? "Remove bookmark" : "Bookmark page"}
          onClick={onToggleBookmark}
        >
          <IconBookmark size={15} filled={bookmarked} />
        </button>
        {!isShellUrl(tab.url) && (
          <button className="nav-btn" title="Reader view" onClick={onReaderMode}>
            <IconReader size={15} />
          </button>
        )}
        <button className="nav-btn" title="Downloads" onClick={onOpenDownloads}>
          <IconDownload size={15} />
        </button>
        <button
          className={`nav-btn nav-btn-ai${aiOpen ? " nav-btn-active" : ""}`}
          title="Toggle AI assistant"
          onClick={onToggleAI}
        >
          <IconSparkle size={15} />
        </button>
      </div>
    </nav>
  );
});
