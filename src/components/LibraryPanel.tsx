import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bookmark, Workspace, WorkspaceCanvas } from "../inix.d";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { TagFilterBar } from "./TagFilterBar";
import { WorkspaceCanvasView } from "./WorkspaceCanvas";

interface LibraryPanelProps {
  onNavigate: (url: string) => void;
}

function filterPins(
  pins: WorkspaceCanvas["pins"],
  query: string,
  activeTags: string[]
): WorkspaceCanvas["pins"] {
  let result = pins;
  if (activeTags.length) {
    result = result.filter((pin) => {
      const tags = pin.tags ? pin.tags.split(",").map((t) => t.trim().toLowerCase()) : [];
      return activeTags.every((t) => tags.includes(t.toLowerCase()));
    });
  }
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (pin) =>
        pin.title?.toLowerCase().includes(q) ||
        pin.url?.toLowerCase().includes(q) ||
        pin.description?.toLowerCase().includes(q)
    );
  }
  return result;
}

export function LibraryPanel({ onNavigate }: LibraryPanelProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<number>(1);
  const [canvas, setCanvas] = useState<WorkspaceCanvas | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [listView, setListView] = useState(false);
  const [listItems, setListItems] = useState<Bookmark[]>([]);
  const [faviconCache, setFaviconCache] = useState<Record<number, string | null>>({});

  const loadFavicons = useCallback(async (pins: WorkspaceCanvas["pins"]) => {
    const cache: Record<number, string | null> = {};
    for (const pin of pins) {
      if (pin.favicon_path) {
        cache[pin.id] = (await window.inix?.bookmarks.favicon(pin.favicon_path)) ?? null;
      }
    }
    setFaviconCache((prev) => ({ ...prev, ...cache }));
  }, []);

  const loadCanvas = useCallback(
    async (wsId: number) => {
      const data = await window.inix?.workspaces.getCanvas(wsId);
      if (data) {
        setCanvas(data);
        await loadFavicons(data.pins);
      }
    },
    [loadFavicons]
  );

  const refresh = useCallback(async () => {
    const ws = await window.inix?.workspaces.list();
    const tags = await window.inix?.bookmarks.allTags();
    if (ws) setWorkspaces(ws);
    if (tags) setAllTags(tags);
    if (activeWsId) await loadCanvas(activeWsId);
  }, [activeWsId, loadCanvas]);

  useEffect(() => {
    void (async () => {
      const defaultId = await window.inix?.workspaces.defaultId();
      if (defaultId) setActiveWsId(defaultId);
      await refresh();
    })();
  }, []);

  useEffect(() => {
    if (activeWsId) void loadCanvas(activeWsId);
  }, [activeWsId, loadCanvas]);

  useEffect(() => {
    void window.inix?.bookmarks
      .list({ tags: activeTags.length ? activeTags : undefined, query: query || undefined })
      .then(setListItems);
  }, [activeTags, query, canvas]);

  const filteredCanvas = useMemo(() => {
    if (!canvas) return null;
    return {
      ...canvas,
      pins: filterPins(canvas.pins, query, activeTags),
    };
  }, [canvas, query, activeTags]);

  const totalBookmarks = canvas?.pins.length ?? 0;
  const visibleCount = listView ? listItems.length : filteredCanvas?.pins.length ?? 0;
  const hasFilters = query.trim().length > 0 || activeTags.length > 0;

  const handleOpenArchive = async (id: number) => {
    const url = await window.inix?.bookmarks.openArchive(id);
    if (url) onNavigate(url);
  };

  const handlePinMove = (bookmarkId: number, x: number, y: number) => {
    void window.inix?.workspaces.setPin(activeWsId, bookmarkId, x, y);
  };

  const handleViewportChange = (x: number, y: number, zoom: number) => {
    void window.inix?.workspaces.setViewport(activeWsId, x, y, zoom);
  };

  const handleRemovePin = async (bookmarkId: number) => {
    await window.inix?.workspaces.removePin(activeWsId, bookmarkId);
    await loadCanvas(activeWsId);
  };

  const handleCreateWorkspace = async (name: string) => {
    const ws = await window.inix?.workspaces.create(name);
    if (ws) {
      setWorkspaces((prev) => [...prev, ws]);
      setActiveWsId(ws.id);
    }
  };

  const handleRenameWorkspace = async (id: number, name: string) => {
    const ok = await window.inix?.workspaces.rename(id, name);
    if (ok) {
      setWorkspaces((prev) => prev.map((ws) => (ws.id === id ? { ...ws, name } : ws)));
    }
  };

  const handleDeleteWorkspace = async (id: number) => {
    if (workspaces.length <= 1) return;
    const ok = await window.inix?.workspaces.delete(id);
    if (ok) {
      const remaining = workspaces.filter((ws) => ws.id !== id);
      setWorkspaces(remaining);
      if (activeWsId === id && remaining.length > 0) {
        setActiveWsId(remaining[0].id);
      }
    }
  };

  const emptyCanvasHint =
    totalBookmarks === 0
      ? "Bookmark a page from the toolbar, or import from Chrome in Settings → Library (export bookmarks as HTML first)."
      : hasFilters
        ? "No bookmarks match your search or tags. Try clearing filters."
        : undefined;

  return (
    <div className="library-panel inix-page">
      <div className="library-shell">
        <header className="library-header">
          <div className="library-header-main">
            <button
              type="button"
              className="library-back"
              onClick={() => onNavigate("inix://newtab")}
            >
              ← New tab
            </button>
            <div>
              <h1>Inix Library</h1>
              <p className="library-subtitle">
                Bookmarks, archives, and workspaces — stored locally on your device
              </p>
            </div>
          </div>
          <div className="library-header-actions">
            <div className="library-search-wrap">
              <span className="library-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                className="library-search"
                placeholder="Search bookmarks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="library-view-toggle-group">
              <button
                type="button"
                className={`library-view-toggle${!listView ? " active" : ""}`}
                onClick={() => setListView(false)}
              >
                Canvas
              </button>
              <button
                type="button"
                className={`library-view-toggle${listView ? " active" : ""}`}
                onClick={() => setListView(true)}
              >
                List
              </button>
            </div>
          </div>
        </header>

        <div className="library-toolbar">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeWsId}
            onSelect={setActiveWsId}
            onCreate={handleCreateWorkspace}
            onRename={handleRenameWorkspace}
            onDelete={handleDeleteWorkspace}
          />
          <p className="library-stats">
            {hasFilters ? (
              <>
                <strong>{visibleCount}</strong> shown · {totalBookmarks} in workspace
              </>
            ) : (
              <>
                <strong>{totalBookmarks}</strong> bookmark{totalBookmarks === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>

        <TagFilterBar tags={allTags} active={activeTags} onChange={setActiveTags} />

        <div className="library-body">
          {listView ? (
            <ul className="library-list">
              {listItems.map((b) => (
                <li key={b.id} className="library-list-item inix-card">
                  <button type="button" className="library-list-open" onClick={() => onNavigate(b.url)}>
                    <strong>{b.title || b.url}</strong>
                    <span>{b.url}</span>
                    {b.tags && (
                      <span className="library-list-tags">
                        {b.tags
                          .split(",")
                          .filter(Boolean)
                          .map((t) => `#${t}`)
                          .join(" ")}
                      </span>
                    )}
                  </button>
                  <div className="library-list-actions">
                    {b.snapshot_path && (
                      <button type="button" className="library-list-archive" onClick={() => void handleOpenArchive(b.id)}>
                        Archive
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {listItems.length === 0 && (
                <li className="library-empty-state">
                  <span className="library-empty-icon" aria-hidden="true">
                    ★
                  </span>
                  <h2>{hasFilters ? "No matches" : "No bookmarks yet"}</h2>
                  <p>
                    {hasFilters
                      ? "Try a different search or clear tag filters."
                      : "Star a page from the toolbar, or import from Chrome in Settings → Library (export as HTML first)."}
                  </p>
                </li>
              )}
            </ul>
          ) : (
            <WorkspaceCanvasView
              canvas={filteredCanvas}
              faviconCache={faviconCache}
              onOpen={onNavigate}
              onOpenArchive={(id) => void handleOpenArchive(id)}
              onRemovePin={(id) => void handleRemovePin(id)}
              onPinMove={handlePinMove}
              onViewportChange={handleViewportChange}
              emptyHint={emptyCanvasHint}
            />
          )}
        </div>
      </div>
    </div>
  );
}
