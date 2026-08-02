import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { BarNode, Bookmark } from "../inix.d";
import { INIX_BOOKMARK_DRAG } from "./NavBar";
import { BookmarkIcon } from "./BookmarkIcon";
import { bookmarkIconMode } from "../utils/bookmark-icon";
import { useChromeOverlay } from "../chrome/ChromeOverlayContext";

export const INIX_BAR_NODE_DRAG = "application/x-inix-bar-node";

const OVERFLOW_BTN_WIDTH = 36;

interface BookmarkBarProps {
  refreshKey?: number;
  activeTabId: string;
  onNavigate: (url: string) => void;
  onOpenNewTab: (url: string) => void;
  onChanged?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node?: BarNode;
  parentId: number | null;
}

interface DropTarget {
  parentId: number | null;
  index: number;
}

interface FolderDialogState {
  mode: "create" | "rename";
  parentId: number | null;
  nodeId?: number;
  value: string;
}

function shortTitle(title: string, url: string): string {
  const t = title.trim();
  if (t && t !== url) return t.length > 32 ? `${t.slice(0, 30)}…` : t;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function collectBookmarks(node: BarNode): Bookmark[] {
  if (node.type === "bookmark") return [node.bookmark];
  return node.children.flatMap(collectBookmarks);
}

function countVisibleItems(containerWidth: number, itemWidths: number[]): number {
  if (itemWidths.length === 0) return 0;
  let used = 0;
  for (let i = 0; i < itemWidths.length; i++) {
    const w = itemWidths[i];
    const hiddenAfter = itemWidths.length - i - 1;
    const reserve = hiddenAfter > 0 ? OVERFLOW_BTN_WIDTH : 0;
    if (used + w + reserve > containerWidth) return i;
    used += w;
  }
  return itemWidths.length;
}

export function BookmarkBar({
  refreshKey = 0,
  activeTabId,
  onNavigate,
  onOpenNewTab,
  onChanged,
}: BookmarkBarProps) {
  const [tree, setTree] = useState<BarNode[]>([]);
  const [favicons, setFavicons] = useState<Record<number, string>>({});
  const [openFolderId, setOpenFolderId] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useChromeOverlay(
    "bookmark-bar-menus",
    menu !== null || openFolderId !== null || overflowOpen || folderDialog !== null
  );
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const folderRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const overflowRef = useRef<HTMLButtonElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const nodes = await window.inix?.bookmarks.listBarTree();
    if (!nodes) return;
    setTree(nodes);

    const allBookmarks = nodes.flatMap(collectBookmarks);
    const icons: Record<number, string> = {};
    await Promise.all(
      allBookmarks.map(async (b) => {
        if (!b.favicon_path) return;
        const dataUrl = await window.inix?.bookmarks.favicon(b.favicon_path);
        if (dataUrl) icons[b.id] = dataUrl;
      })
    );
    setFavicons(icons);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const recalculateOverflow = useCallback(() => {
    const track = trackRef.current;
    const measure = measureRef.current;
    if (!track || !measure || tree.length === 0) {
      setVisibleCount(tree.length);
      return;
    }

    const items = measure.querySelectorAll<HTMLElement>("[data-bar-item]");
    const widths = Array.from(items).map((el) => el.getBoundingClientRect().width);
    const count = countVisibleItems(track.clientWidth, widths);
    setVisibleCount(count);
    if (count >= tree.length) setOverflowOpen(false);
  }, [tree]);

  useLayoutEffect(() => {
    recalculateOverflow();
  }, [recalculateOverflow, favicons, tree]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => recalculateOverflow());
    ro.observe(track);
    return () => ro.disconnect();
  }, [recalculateOverflow]);

  useEffect(() => {
    if (!menu && openFolderId === null && !overflowOpen && !folderDialog) return;
    const close = () => {
      setMenu(null);
      setOpenFolderId(null);
      setOverflowOpen(false);
    };
    const isInsideBarPopup = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el?.closest?.(
        ".bookmark-bar-overflow-menu, .bookmark-bar-folder-popup, .bookmark-bar-menu, .bookmark-bar-folder-dialog, .bookmark-bar-folder-dialog-backdrop"
      );
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const el = t as HTMLElement;
      if (el.closest?.(".bookmark-bar-folder-dialog, .bookmark-bar-folder-dialog-backdrop")) return;
      if (barRef.current?.contains(t)) {
        if (overflowRef.current?.contains(t)) return;
        return;
      }
      close();
      setFolderDialog(null);
    };
    const onScroll = (e: Event) => {
      if (isInsideBarPopup(e.target)) return;
      close();
    };
    window.addEventListener("click", onDoc as unknown as EventListener);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("click", onDoc as unknown as EventListener);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu, openFolderId, overflowOpen, folderDialog]);

  const folderDialogKey = folderDialog
    ? `${folderDialog.mode}:${folderDialog.nodeId ?? "new"}:${folderDialog.parentId ?? "root"}`
    : null;

  useEffect(() => {
    if (!folderDialogKey) return;
    const input = folderInputRef.current;
    const frame = requestAnimationFrame(() => {
      input?.focus();
      input?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [folderDialogKey]);

  const notify = () => {
    onChanged?.();
    void load();
  };

  const submitFolderDialog = () => {
    if (!folderDialog) return;
    const name = folderDialog.value.trim();
    if (!name) {
      setFolderDialog(null);
      return;
    }
    if (folderDialog.mode === "create") {
      void window.inix?.bookmarks.barCreateFolder(name, folderDialog.parentId).then(() => notify());
    } else if (folderDialog.nodeId != null) {
      void window.inix?.bookmarks.barRenameFolder(folderDialog.nodeId, name).then(() => notify());
    }
    setFolderDialog(null);
    setMenu(null);
  };

  const handleAddressDrop = async (parentId: number | null, index: number, data: string) => {
    try {
      const payload = JSON.parse(data) as { url: string; title: string; tabId?: string };
      if (payload.tabId) {
        const result = await window.inix?.bookmarks.saveFromTab(payload.tabId, {
          barParentId: parentId,
          barInsertIndex: index,
        });
        if (!result?.ok) return;
      } else if (payload.url) {
        const existing = await window.inix?.bookmarks.check(payload.url);
        if (!existing) {
          await window.inix?.bookmarks.saveFromTab(activeTabId, {
            barParentId: parentId,
            barInsertIndex: index,
          });
        } else {
          await window.inix?.bookmarks.barAddUrl(payload.url, parentId, index);
        }
      }
      notify();
    } catch {
      // ignore bad payload
    }
  };

  const handleBarDrop = async (parentId: number | null, index: number, e: DragEvent) => {
    const barData = e.dataTransfer.getData(INIX_BAR_NODE_DRAG);
    if (barData) {
      try {
        const { nodeId } = JSON.parse(barData) as { nodeId: number };
        await window.inix?.bookmarks.barMoveNode(nodeId, parentId, index);
        notify();
      } catch {
        // ignore
      }
      return;
    }
    const bookmarkData = e.dataTransfer.getData(INIX_BOOKMARK_DRAG);
    if (bookmarkData) {
      await handleAddressDrop(parentId, index, bookmarkData);
    }
  };

  const onDragOverSlot = (e: DragEvent, parentId: number | null, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ parentId, index });
  };

  const renderDropSlot = (parentId: number | null, index: number, key: string) => {
    const active = dropTarget?.parentId === parentId && dropTarget.index === index;
    return (
      <div
        key={key}
        className={`bookmark-bar-drop-slot${active ? " is-active" : ""}`}
        onDragOver={(e) => onDragOverSlot(e, parentId, index)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(null);
          void handleBarDrop(parentId, index, e);
        }}
      />
    );
  };

  const renderBookmarkChip = (
    node: Extract<BarNode, { type: "bookmark" }>,
    parentId: number | null,
    index: number,
    opts: { inMenu?: boolean; showDropSlots?: boolean } = {}
  ) => {
    const { inMenu = false, showDropSlots = true } = opts;
    const b = node.bookmark;
    return (
      <div
        key={`b-${node.id}${inMenu ? "-menu" : ""}`}
        className="bookmark-bar-chip-wrap"
        data-bar-item={inMenu ? undefined : ""}
      >
        {showDropSlots && !inMenu && renderDropSlot(parentId, index, `slot-${node.id}-before`)}
        <button
          type="button"
          className={`bookmark-bar-chip${inMenu ? " bookmark-bar-chip-menu" : ""}`}
          draggable={!inMenu}
          title={b.title || b.url}
          onClick={() => {
            onNavigate(b.url);
            setOpenFolderId(null);
            setOverflowOpen(false);
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onOpenNewTab(b.url);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, node, parentId });
          }}
          onDragStart={(e) => {
            if (inMenu) return;
            setDraggingNodeId(node.id);
            e.dataTransfer.setData(INIX_BAR_NODE_DRAG, JSON.stringify({ nodeId: node.id, parentId }));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggingNodeId(null);
            setDropTarget(null);
          }}
        >
          <BookmarkIcon bookmark={b} storedFavicon={favicons[b.id]} />
          <span className="bookmark-bar-chip-label">{shortTitle(b.title, b.url)}</span>
        </button>
      </div>
    );
  };

  const renderFolderMenu = (nodes: BarNode[], parentId: number) => (
    <div className="bookmark-bar-folder-menu">
      {renderDropSlot(parentId, 0, `menu-slot-${parentId}-0`)}
      {nodes.map((child, i) => {
        if (child.type === "bookmark") {
          return renderBookmarkChip(child, parentId, i, { inMenu: true, showDropSlots: false });
        }
        return (
          <div key={`f-${child.id}`} className="bookmark-bar-folder-submenu">
            <div className="bookmark-bar-folder-menu-item">
              <span className="bookmark-bar-folder-menu-label">📁 {child.title}</span>
              <div className="bookmark-bar-folder-menu-nested">
                {renderFolderMenu(child.children, child.id)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderFolder = (
    node: Extract<BarNode, { type: "folder" }>,
    parentId: number | null,
    index: number,
    opts: { inMenu?: boolean; showDropSlots?: boolean } = {}
  ) => {
    const { inMenu = false, showDropSlots = true } = opts;
    const isOpen = openFolderId === node.id;

    return (
      <div
        key={`folder-${node.id}${inMenu ? "-menu" : ""}`}
        className={`bookmark-bar-folder-wrap${inMenu ? " bookmark-bar-folder-wrap-menu" : ""}`}
        data-bar-item={inMenu ? undefined : ""}
      >
        {showDropSlots && !inMenu && renderDropSlot(parentId, index, `slot-folder-${node.id}`)}
        <button
          type="button"
          ref={(el) => {
            if (inMenu) return;
            if (el) folderRefs.current.set(node.id, el);
            else folderRefs.current.delete(node.id);
          }}
          className={`bookmark-bar-folder${isOpen ? " is-open" : ""}${dropTarget?.parentId === node.id ? " is-drop-target" : ""}${inMenu ? " bookmark-bar-chip-menu" : ""}`}
          draggable={!inMenu}
          title={node.title}
          onClick={() => {
            setOpenFolderId(isOpen ? null : node.id);
            if (!inMenu) setOverflowOpen(false);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, node, parentId });
          }}
          onDragStart={(e) => {
            if (inMenu) return;
            setDraggingNodeId(node.id);
            e.dataTransfer.setData(INIX_BAR_NODE_DRAG, JSON.stringify({ nodeId: node.id, parentId }));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggingNodeId(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (inMenu) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget({ parentId: node.id, index: node.children.length });
          }}
          onDrop={(e) => {
            if (inMenu) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(null);
            void handleBarDrop(node.id, node.children.length, e);
          }}
        >
          <span className="bookmark-bar-folder-icon">📁</span>
          <span className="bookmark-bar-folder-label">{node.title}</span>
          {!inMenu && <span className="bookmark-bar-folder-chevron">{isOpen ? "▴" : "▾"}</span>}
        </button>
        {isOpen && inMenu && (
          <div className="bookmark-bar-overflow-folder-children">
            {node.children.map((child, ci) => renderNode(child, node.id, ci, { inMenu: true }))}
          </div>
        )}
        {isOpen && !inMenu && (
          <div
            className="bookmark-bar-folder-popup"
            style={{ left: folderRefs.current.get(node.id)?.offsetLeft ?? 0 }}
          >
            {renderFolderMenu(node.children, node.id)}
          </div>
        )}
      </div>
    );
  };

  const renderNode = (
    node: BarNode,
    parentId: number | null,
    index: number,
    opts?: { inMenu?: boolean; showDropSlots?: boolean }
  ) => {
    if (node.type === "bookmark") return renderBookmarkChip(node, parentId, index, opts);
    return renderFolder(node, parentId, index, opts);
  };

  const renderItemRow = (
    nodes: BarNode[],
    opts: { inMenu?: boolean; showDropSlots?: boolean; keyPrefix?: string } = {}
  ) => (
    <>
      {opts.showDropSlots !== false && !opts.inMenu && renderDropSlot(null, 0, `${opts.keyPrefix ?? ""}root-0`)}
      {nodes.map((node, i) => renderNode(node, null, i, opts))}
      {opts.showDropSlots !== false &&
        !opts.inMenu &&
        renderDropSlot(null, nodes.length, `${opts.keyPrefix ?? ""}root-end`)}
    </>
  );

  const visibleNodes = tree.slice(0, visibleCount);
  const overflowNodes = tree.slice(visibleCount);
  const hasOverflow = overflowNodes.length > 0;
  const empty = tree.length === 0;

  return (
    <div
      className={`bookmark-bar${empty ? " bookmark-bar-empty" : ""}${draggingNodeId ? " is-dragging" : ""}`}
      ref={barRef}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".bookmark-bar-chip, .bookmark-bar-folder")) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, parentId: null });
      }}
      onDragOver={(e) => {
        if (empty) {
          e.preventDefault();
          setDropTarget({ parentId: null, index: 0 });
        }
      }}
      onDrop={(e) => {
        if (empty) {
          e.preventDefault();
          void handleBarDrop(null, 0, e);
        }
      }}
    >
      <div className="bookmark-bar-measure" ref={measureRef} aria-hidden>
        {renderItemRow(tree, { showDropSlots: true, keyPrefix: "m-" })}
      </div>

      <div className="bookmark-bar-track" ref={trackRef}>
        {renderItemRow(visibleNodes, { showDropSlots: true, keyPrefix: "v-" })}
      </div>

      {hasOverflow && (
        <button
          type="button"
          ref={overflowRef}
          className={`bookmark-bar-overflow${overflowOpen ? " is-open" : ""}`}
          title={`${overflowNodes.length} more bookmark${overflowNodes.length === 1 ? "" : "s"}`}
          onClick={(e) => {
            e.stopPropagation();
            setOverflowOpen((o) => !o);
            setOpenFolderId(null);
          }}
        >
          »
        </button>
      )}

      {hasOverflow && overflowOpen && (
        <div className="bookmark-bar-overflow-menu">
          {overflowNodes.map((node, i) => renderNode(node, null, visibleCount + i, { inMenu: true }))}
        </div>
      )}

      {empty && <span className="bookmark-bar-empty-hint">Drag a site here to bookmark</span>}

      {menu && (
        <div
          className="bookmark-bar-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setFolderDialog({
                mode: "create",
                parentId: menu.parentId,
                value: "New folder",
              });
              setMenu(null);
            }}
          >
            New folder
          </button>
          {menu.node?.type === "folder" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFolderDialog({
                    mode: "rename",
                    parentId: menu.parentId,
                    nodeId: menu.node!.id,
                    value: menu.node?.type === "folder" ? menu.node.title : "",
                  });
                  setMenu(null);
                }}
              >
                Rename folder
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Delete this folder and its contents from the bar?")) {
                    void window.inix?.bookmarks.barDeleteNode(menu.node!.id).then(() => notify());
                  }
                  setMenu(null);
                }}
              >
                Delete folder
              </button>
            </>
          )}
          {menu.node?.type === "bookmark" && (
            <>
              <button
                type="button"
                onClick={() => {
                  const node = menu.node;
                  if (node?.type !== "bookmark") return;
                  const next = bookmarkIconMode(node.bookmark) === "letter" ? "favicon" : "letter";
                  void window.inix?.bookmarks.setIconMode(node.bookmark.id, next).then(() => notify());
                  setMenu(null);
                }}
              >
                {menu.node?.type === "bookmark" && bookmarkIconMode(menu.node.bookmark) === "letter"
                  ? "Use site icon"
                  : "Use letter icon"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const node = menu.node;
                  if (node?.type === "bookmark") onOpenNewTab(node.bookmark.url);
                  setMenu(null);
                }}
              >
                Open in new tab
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.inix?.bookmarks.barDeleteNode(menu.node!.id).then(() => notify());
                  setMenu(null);
                }}
              >
                Remove from bar
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = menu.node?.type === "bookmark" ? menu.node.bookmark.url : "";
                  if (url && confirm("Delete this bookmark from your library?")) {
                    void window.inix?.bookmarks.remove(url).then(() => notify());
                  }
                  setMenu(null);
                }}
              >
                Delete bookmark
              </button>
            </>
          )}
        </div>
      )}

      {folderDialog &&
        createPortal(
          <>
            <button
              type="button"
              className="bookmark-bar-folder-dialog-backdrop"
              aria-label="Close folder dialog"
              onClick={() => setFolderDialog(null)}
            />
            <div
              className="bookmark-bar-folder-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={folderDialog.mode === "create" ? "New folder" : "Rename folder"}
              onClick={(e) => e.stopPropagation()}
            >
              <label className="bookmark-bar-folder-dialog-label">
                {folderDialog.mode === "create" ? "New folder" : "Rename folder"}
                <input
                  ref={folderInputRef}
                  type="text"
                  className="bookmark-bar-folder-dialog-input"
                  value={folderDialog.value}
                  onChange={(e) => setFolderDialog({ ...folderDialog, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitFolderDialog();
                    if (e.key === "Escape") setFolderDialog(null);
                  }}
                />
              </label>
              <div className="bookmark-bar-folder-dialog-actions">
                <button
                  type="button"
                  className="bookmark-bar-folder-dialog-cancel"
                  onClick={() => setFolderDialog(null)}
                >
                  Cancel
                </button>
                <button type="button" className="bookmark-bar-folder-dialog-save" onClick={submitFolderDialog}>
                  Save
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
