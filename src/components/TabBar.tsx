import { useRef, useState } from "react";
import type { Tab } from "../types";
import { IconClose, IconPlus } from "./chrome/ChromeIcons";

const GROUP_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "gray", label: "Gray", hex: "#8a8f98" },
  { id: "blue", label: "Blue", hex: "#4c84ff" },
  { id: "red", label: "Red", hex: "#e5484d" },
  { id: "yellow", label: "Yellow", hex: "#f5a623" },
  { id: "green", label: "Green", hex: "#30a46c" },
  { id: "pink", label: "Pink", hex: "#e93d82" },
  { id: "purple", label: "Purple", hex: "#8e4ec6" },
  { id: "cyan", label: "Cyan", hex: "#00b7c4" },
];

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
  onToggleMute?: (id: string) => void;
  onSetGroup?: (id: string, group: { id: string; name: string; color: string } | null) => void;
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
  onToggleMute,
  onSetGroup,
  embedded = false,
}: TabBarProps) {
  const dragIndex = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
    openUp: boolean;
  } | null>(null);
  const [groupSubmenuOpen, setGroupSubmenuOpen] = useState(false);

  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Keep tabs with the same groupId adjacent while preserving base order
    if (a.groupId && b.groupId && a.groupId !== b.groupId) {
      // Order groups by the earliest tab index in the source array
      const aFirst = tabs.findIndex((t) => t.groupId === a.groupId);
      const bFirst = tabs.findIndex((t) => t.groupId === b.groupId);
      if (aFirst !== bFirst) return aFirst - bFirst;
    }
    if (a.groupId && !b.groupId) {
      const aFirst = tabs.findIndex((t) => t.groupId === a.groupId);
      return aFirst - tabs.indexOf(b);
    }
    if (!a.groupId && b.groupId) {
      const bFirst = tabs.findIndex((t) => t.groupId === b.groupId);
      return tabs.indexOf(a) - bFirst;
    }
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
            className={`tab${tab.id === activeTabId ? " tab-active" : ""}${tab.private ? " tab-private" : ""}${tab.frozen ? " tab-frozen" : ""}${tab.pinned ? " tab-pinned" : ""}${tab.groupId ? " tab-grouped" : ""}`}
            style={tab.groupColor ? ({ ["--tab-group-color" as string]: tab.groupColor } as React.CSSProperties) : undefined}
            title={tab.groupName ? `${tab.groupName} · ${tab.title}` : undefined}
            onClick={() => onSelect(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1 && !tab.pinned) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const x = Math.min(e.clientX, window.innerWidth - 180);
              const y = rect.bottom + 4;
              const contentTop =
                document.querySelector(".content-area")?.getBoundingClientRect().top ??
                document.querySelector(".nav-bar")?.getBoundingClientRect().bottom ??
                document.querySelector(".browser-header")?.getBoundingClientRect().bottom ??
                90;
              const openUp = y + 280 > contentTop;
              setContextMenu({
                tabId: tab.id,
                x,
                y: openUp ? rect.top - 4 : y,
                openUp,
              });
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
            {(tab.audible || tab.muted) && !tab.frozen && (
              <button
                type="button"
                className={`tab-audio-icon${tab.muted ? " tab-muted" : ""}`}
                title={tab.muted ? "Unmute tab" : "Mute tab"}
                aria-label={tab.muted ? "Unmute tab" : "Mute tab"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMute?.(tab.id);
                }}
              >
                {tab.muted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M11 5L6 9H2v6h4l5 4V5z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
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
                )}
              </button>
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
          <div
            className="tab-context-backdrop"
            onClick={() => {
              setContextMenu(null);
              setGroupSubmenuOpen(false);
            }}
          />
          <menu
            className="tab-context-menu"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              transform: contextMenu.openUp ? "translateY(-100%)" : undefined,
            }}
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
            {onToggleMute && (
              <button
                onClick={() => {
                  onToggleMute(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                {tabs.find((t) => t.id === contextMenu.tabId)?.muted ? "Unmute tab" : "Mute tab"}
              </button>
            )}
            {onSetGroup && (
              <>
                <div className="tab-context-divider" role="separator" />
                {!groupSubmenuOpen ? (
                  <>
                    <button onClick={() => setGroupSubmenuOpen(true)}>
                      {tabs.find((t) => t.id === contextMenu.tabId)?.groupId
                        ? "Change group…"
                        : "Add to new group…"}
                    </button>
                    {tabs.find((t) => t.id === contextMenu.tabId)?.groupId && (
                      <button
                        onClick={() => {
                          onSetGroup(contextMenu.tabId, null);
                          setContextMenu(null);
                        }}
                      >
                        Remove from group
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="tab-context-group-label">Choose a color</div>
                    <div className="tab-context-group-swatches">
                      {GROUP_COLORS.map((c) => (
                        <button
                          key={c.id}
                          className="tab-context-group-swatch"
                          style={{ background: c.hex }}
                          title={c.label}
                          aria-label={c.label}
                          onClick={() => {
                            const currentTab = tabs.find((t) => t.id === contextMenu.tabId);
                            const groupId = currentTab?.groupId ?? `grp-${Date.now()}`;
                            const name = currentTab?.groupName ?? c.label;
                            onSetGroup(contextMenu.tabId, { id: groupId, name, color: c.hex });
                            setContextMenu(null);
                            setGroupSubmenuOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
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
