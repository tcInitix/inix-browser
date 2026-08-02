import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { BarNode, Bookmark } from "../inix.d";
import { INIX_BOOKMARK_DRAG } from "./NavBar";

export const INIX_BAR_NODE_DRAG = "application/x-inix-bar-node";

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
  const barRef = useRef<HTMLDivElement>(null);
  const folderRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

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

  useEffect(() => {
    if (!menu && openFolderId === null) return;
    const close = () => {
      setMenu(null);
      setOpenFolderId(null);
    };
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener("click", onDoc as unknown as EventListener);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", onDoc as unknown as EventListener);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, openFolderId]);

  const notify = () => {
    onChanged?.();
    void load();
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
    const active =
      dropTarget?.parentId === parentId && dropTarget.index === index;
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
    inMenu = false
  ) => {
    const b = node.bookmark;
    return (
      <div key={`b-${node.id}`} className="bookmark-bar-chip-wrap">
        {!inMenu && renderDropSlot(parentId, index, `slot-${node.id}-before`)}
        <button
          type="button"
          className={`bookmark-bar-chip${inMenu ? " bookmark-bar-chip-menu" : ""}`}
          draggable
          title={b.title || b.url}
          onClick={() => {
            if (!inMenu) onNavigate(b.url);
            else {
              onNavigate(b.url);
              setOpenFolderId(null);
            }
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
            setDraggingNodeId(node.id);
            e.dataTransfer.setData(INIX_BAR_NODE_DRAG, JSON.stringify({ nodeId: node.id, parentId }));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggingNodeId(null);
            setDropTarget(null);
          }}
        >
          {favicons[b.id] ? (
            <img src={favicons[b.id]} alt="" className="bookmark-bar-chip-icon" />
          ) : (
            <span className="bookmark-bar-chip-icon bookmark-bar-chip-icon-fallback">◆</span>
          )}
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
          return renderBookmarkChip(child, parentId, i, true);
        }
        return (
          <div key={`f-${child.id}`} className="bookmark-bar-folder-submenu">
            {renderDropSlot(parentId, i, `menu-slot-${child.id}-before`)}
            <div className="bookmark-bar-folder-menu-item">
              <span className="bookmark-bar-folder-menu-label">📁 {child.title}</span>
              <div className="bookmark-bar-folder-menu-nested">
                {renderFolderMenu(child.children, child.id)}
              </div>
            </div>
          </div>
        );
      })}
      {renderDropSlot(parentId, nodes.length, `menu-slot-${parentId}-end`)}
    </div>
  );

  const renderFolder = (node: Extract<BarNode, { type: "folder" }>, parentId: number | null, index: number) => {
    const isOpen = openFolderId === node.id;
    const folderBtn = (
      <button
        type="button"
        ref={(el) => {
          if (el) folderRefs.current.set(node.id, el);
          else folderRefs.current.delete(node.id);
        }}
        className={`bookmark-bar-folder${isOpen ? " is-open" : ""}${dropTarget?.parentId === node.id ? " is-drop-target" : ""}`}
        draggable
        title={node.title}
        onClick={() => setOpenFolderId(isOpen ? null : node.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, node, parentId });
        }}
        onDragStart={(e) => {
          setDraggingNodeId(node.id);
          e.dataTransfer.setData(INIX_BAR_NODE_DRAG, JSON.stringify({ nodeId: node.id, parentId }));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDraggingNodeId(null);
          setDropTarget(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget({ parentId: node.id, index: node.children.length });
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(null);
          void handleBarDrop(node.id, node.children.length, e);
        }}
      >
        <span className="bookmark-bar-folder-icon">📁</span>
        <span className="bookmark-bar-folder-label">{node.title}</span>
        <span className="bookmark-bar-folder-chevron">{isOpen ? "▴" : "▾"}</span>
      </button>
    );

    return (
      <div key={`folder-${node.id}`} className="bookmark-bar-folder-wrap">
        {renderDropSlot(parentId, index, `slot-folder-${node.id}`)}
        {folderBtn}
        {isOpen && (
          <div
            className="bookmark-bar-folder-popup"
            style={{
              left: folderRefs.current.get(node.id)?.offsetLeft ?? 0,
            }}
          >
            {renderFolderMenu(node.children, node.id)}
          </div>
        )}
      </div>
    );
  };

  const renderRoot = () => (
    <>
      {renderDropSlot(null, 0, "root-0")}
      {tree.map((node, i) => {
        if (node.type === "bookmark") return renderBookmarkChip(node, null, i);
        return renderFolder(node, null, i);
      })}
      {renderDropSlot(null, tree.length, "root-end")}
    </>
  );

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
      <div className="bookmark-bar-scroll">{renderRoot()}</div>

      {empty && (
        <span className="bookmark-bar-empty-hint">Drag a site here to bookmark</span>
      )}

      {menu && (
        <div
          className="bookmark-bar-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Folder name", "New folder");
              if (name?.trim()) {
                void window.inix?.bookmarks
                  .barCreateFolder(name.trim(), menu.parentId)
                  .then(() => notify());
              }
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
                  const name = window.prompt("Rename folder", menu.node?.type === "folder" ? menu.node.title : "");
                  if (name?.trim()) {
                    void window.inix?.bookmarks
                      .barRenameFolder(menu.node!.id, name.trim())
                      .then(() => notify());
                  }
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
    </div>
  );
}
