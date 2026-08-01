import { useCallback, useEffect, useRef, useState } from "react";
import type { Bookmark } from "../inix.d";

interface BookmarkBarProps {
  refreshKey?: number;
  onNavigate: (url: string) => void;
  onOpenNewTab: (url: string) => void;
}

function shortTitle(title: string, url: string): string {
  const t = title.trim();
  if (t && t !== url) return t.length > 28 ? `${t.slice(0, 26)}…` : t;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function BookmarkBar({ refreshKey = 0, onNavigate, onOpenNewTab }: BookmarkBarProps) {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [favicons, setFavicons] = useState<Record<number, string>>({});
  const [menu, setMenu] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const list = await window.inix?.bookmarks.listBar();
    if (!list) return;
    setItems(list as Bookmark[]);

    const icons: Record<number, string> = {};
    await Promise.all(
      (list as Bookmark[]).map(async (b) => {
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
    if (!menu) return;
    const close = () => setMenu(null);
    const onDocClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener("click", onDocClick);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  if (items.length === 0) {
    return (
      <div className="bookmark-bar bookmark-bar-empty" ref={barRef}>
        <span className="bookmark-bar-hint">Bookmarks you save will appear here</span>
      </div>
    );
  }

  return (
    <div className="bookmark-bar" ref={barRef}>
      <div className="bookmark-bar-scroll">
        {items.map((b) => (
          <button
            key={b.id}
            type="button"
            className="bookmark-bar-item"
            title={b.title || b.url}
            onClick={() => onNavigate(b.url)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onOpenNewTab(b.url);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ bookmark: b, x: e.clientX, y: e.clientY });
            }}
          >
            {favicons[b.id] ? (
              <img src={favicons[b.id]} alt="" className="bookmark-bar-favicon" />
            ) : (
              <span className="bookmark-bar-favicon bookmark-bar-favicon-placeholder">★</span>
            )}
            <span className="bookmark-bar-label">{shortTitle(b.title, b.url)}</span>
          </button>
        ))}
      </div>

      {menu && (
        <div
          className="bookmark-bar-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onOpenNewTab(menu.bookmark.url);
              setMenu(null);
            }}
          >
            Open in new tab
          </button>
          <button
            type="button"
            onClick={() => {
              void window.inix?.bookmarks.setBar(menu.bookmark.id, false).then(() => load());
              setMenu(null);
            }}
          >
            Remove from bar
          </button>
          <button
            type="button"
            onClick={() => {
              void window.inix?.bookmarks.remove(menu.bookmark.url).then(() => load());
              setMenu(null);
            }}
          >
            Delete bookmark
          </button>
        </div>
      )}
    </div>
  );
}
