import { useState, useEffect, forwardRef, useImperativeHandle, useRef, type FormEvent, type KeyboardEvent } from "react";
import type { Tab } from "../types";
import { isShellUrl } from "../types";

export const INIX_BOOKMARK_DRAG = "application/x-inix-bookmark";

export interface AddressBarHandle {
  focus: () => void;
}

interface NavBarProps {
  tab: Tab;
  onNavigate: (url: string) => void | Promise<void>;
  onNewTab: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onOpenSearch: () => void;
  onToggleAI: () => void;
  onToggleBookmark: () => void;
  onOpenLibrary: () => void;
  onOpenDownloads: () => void;
  onReaderMode: () => void;
  bookmarked: boolean;
  aiOpen: boolean;
}

export const NavBar = forwardRef<AddressBarHandle, NavBarProps>(function NavBar(
  {
    tab,
    onNavigate,
    onNewTab,
    onBack,
    onForward,
    onReload,
    onHome,
    onOpenSearch,
    onToggleAI,
    onToggleBookmark,
    onOpenLibrary,
    onOpenDownloads,
    onReaderMode,
    bookmarked,
    aiOpen,
  },
  ref
) {
  const [input, setInput] = useState(tab.url);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  useEffect(() => {
    if (tab.url === "inix://newtab") setInput("");
    else if (tab.url === "inix://settings") setInput("inix://settings");
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

  return (
    <nav className="nav-bar">
      <div className="nav-controls">
        <button className="nav-btn" disabled={!tab.canGoBack} title="Back" onClick={onBack}>
          ←
        </button>
        <button className="nav-btn" disabled={!tab.canGoForward} title="Forward" onClick={onForward}>
          →
        </button>
        <button className="nav-btn" title="Reload" onClick={onReload}>
          ↻
        </button>
        <button className="nav-btn" title="Home (Alt+Home)" onClick={onHome}>
          ⌂
        </button>
        <button
          className={`nav-btn${bookmarked ? " nav-btn-active" : ""}`}
          title={bookmarked ? "Remove bookmark" : "Bookmark page"}
          onClick={onToggleBookmark}
        >
          {bookmarked ? "★" : "☆"}
        </button>
      </div>
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
              <span className={`address-site-chip-lock ${securityState}`} title={securityTitle}>
                {securityIcon}
              </span>
            )}
          </div>
        )}
        <button type="button" className="address-search-btn" title="Inix Search (/)" onClick={onOpenSearch}>
          ⌕
        </button>
        <input
          ref={inputRef}
          className="address-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter a URL · type / for history search"
          spellCheck={false}
        />
      </form>
      {!isShellUrl(tab.url) && (
        <button className="nav-btn" title="Reader view" onClick={onReaderMode}>
          📖
        </button>
      )}
      <button className="nav-btn" title="Downloads" onClick={onOpenDownloads}>
        ↓
      </button>
      <button
        className={`nav-btn nav-btn-ai${aiOpen ? " nav-btn-active" : ""}`}
        title="Toggle AI assistant"
        onClick={onToggleAI}
      >
        ✦
      </button>
      <button className="nav-btn" title="Inix Library" onClick={onOpenLibrary}>
        ★
      </button>
      <button className="nav-btn nav-btn-new" onClick={onNewTab} title="New tab">
        +
      </button>
    </nav>
  );
});
