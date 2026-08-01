import { useCallback, useEffect, useState } from "react";
import type { Bookmark, Workspace, WorkspaceCanvas } from "../inix.d";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { TagFilterBar } from "./TagFilterBar";
import { WorkspaceCanvasView } from "./WorkspaceCanvas";

interface LibraryPanelProps {
  onNavigate: (url: string) => void;
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
        cache[pin.id] = await window.inix?.bookmarks.favicon(pin.favicon_path) ?? null;
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
    if (!listView) return;
    void window.inix?.bookmarks
      .list({ tags: activeTags.length ? activeTags : undefined, query: query || undefined })
      .then(setListItems);
  }, [listView, activeTags, query]);

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

  return (
    <div className="library-panel">
      <header className="library-header">
        <div>
          <h1>
            <span className="logo-icon">◆</span> Inix Library
          </h1>
          <p className="library-subtitle">Your local knowledge base — bookmarks, archives, and workspaces</p>
        </div>
        <div className="library-header-actions">
          <input
            className="library-search"
            placeholder="Search bookmarks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`library-view-toggle${listView ? " active" : ""}`}
            onClick={() => setListView((v) => !v)}
          >
            {listView ? "Canvas" : "List"}
          </button>
        </div>
      </header>

      <WorkspaceSwitcher
        workspaces={workspaces}
        activeId={activeWsId}
        onSelect={setActiveWsId}
        onCreate={handleCreateWorkspace}
      />

      <TagFilterBar tags={allTags} active={activeTags} onChange={setActiveTags} />

      {listView ? (
        <ul className="library-list">
          {listItems.map((b) => (
            <li key={b.id} className="library-list-item">
              <button type="button" className="library-list-open" onClick={() => onNavigate(b.url)}>
                <strong>{b.title || b.url}</strong>
                <span>{b.url}</span>
                {b.tags && (
                  <span className="library-list-tags">
                    {b.tags.split(",").filter(Boolean).map((t) => `#${t}`).join(" ")}
                  </span>
                )}
              </button>
              {b.snapshot_path && (
                <button type="button" onClick={() => void handleOpenArchive(b.id)}>
                  Archive
                </button>
              )}
            </li>
          ))}
          {listItems.length === 0 && <li className="library-empty">No bookmarks yet — star a page to save it.</li>}
        </ul>
      ) : (
        <WorkspaceCanvasView
          canvas={canvas}
          faviconCache={faviconCache}
          onOpen={onNavigate}
          onOpenArchive={(id) => void handleOpenArchive(id)}
          onRemovePin={(id) => void handleRemovePin(id)}
          onPinMove={handlePinMove}
          onViewportChange={handleViewportChange}
        />
      )}
    </div>
  );
}
