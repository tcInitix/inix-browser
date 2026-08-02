import { useRef, useState } from "react";
import type { Tab } from "../types";
import { IconClose, IconPlus } from "./chrome/ChromeIcons";
import { useChromeOverlay } from "../chrome/ChromeOverlayContext";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: () => void;
  onNewTab: () => void;
  onPin: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  embedded?: boolean;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
  onNewTab,
  onPin,
  onDuplicate,
  onReorder,
  embedded = false,
}: TabBarProps) {
  const dragIndex = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);

  useChromeOverlay("tab-context-menu", contextMenu !== null);

  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return tabs.indexOf(a) - tabs.indexOf(b);
  });

  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDrop = (toIndex: number) => {
    if (dragIndex.current === null || dragIndex.current === toIndex) return;
    onReorder(dragIndex.current, toIndex);
    dragIndex.current = null;
  };

  return (
    <div className={`tab-bar${embedded ? " tab-bar-embedded" : ""}`}>
      <div className="tab-list">
        {sortedTabs.map((tab) => (
          <div
            key={tab.id}
            draggable
            className={`tab${tab.id === activeTabId ? " tab-active" : ""}${tab.private ? " tab-private" : ""}${tab.frozen ? " tab-frozen" : ""}${tab.pinned ? " tab-pinned" : ""}`}
            onClick={() => onSelect(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1 && !tab.pinned) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
            }}
            onDragStart={() => handleDragStart(tabs.indexOf(tab))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(tabs.indexOf(tab))}
          >
            {tab.isLoading && !tab.frozen && <span className="tab-spinner" />}
            {tab.pinned ? (
              <span className="tab-favicon-placeholder tab-pin-icon" title="Pinned">📌</span>
            ) : tab.frozen ? (
              <span className="tab-favicon-placeholder tab-frozen-icon" title="Tab hibernated">❄</span>
            ) : tab.private ? (
              <span className="tab-favicon-placeholder tab-private-icon" title="Private tab">⛊</span>
            ) : tab.favicon ? (
              <img className="tab-favicon" src={tab.favicon} alt="" />
            ) : (
              <span className="tab-favicon-placeholder">◆</span>
            )}
            {tab.audible && !tab.frozen && (
              <span className="tab-audio-icon" title="This tab is playing sound" aria-label="Playing sound">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M11 5L6 9H2v6h4l5 4V5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
            <span className="tab-title">{tab.title}</span>
            {!tab.pinned && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                aria-label="Close tab"
              >
                <IconClose size={12} />
              </button>
            )}
          </div>
        ))}
        <button className="tab-new" onClick={onNewTab} aria-label="New tab" title="New tab">
          <IconPlus size={14} />
        </button>
      </div>

      {contextMenu && (
        <>
          <div className="tab-context-backdrop" onClick={() => setContextMenu(null)} />
          <menu
            className="tab-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                onPin(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              {tabs.find((t) => t.id === contextMenu.tabId)?.pinned ? "Unpin tab" : "Pin tab"}
            </button>
            <button
              onClick={() => {
                onDuplicate(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              Duplicate tab
            </button>
            <button
              onClick={() => {
                onClose(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              Close tab
            </button>
            <div className="tab-context-divider" role="separator" />
            <button
              disabled={tabs.length <= 1}
              onClick={() => {
                onCloseOthers(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              Close other tabs
            </button>
            <button
              onClick={() => {
                onCloseAll();
                setContextMenu(null);
              }}
            >
              Close all tabs
            </button>
          </menu>
        </>
      )}
    </div>
  );
}
