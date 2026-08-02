import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import type { CanvasBookmark } from "../inix.d";
import { BookmarkIcon } from "./BookmarkIcon";

export interface BookmarkNodeData {
  bookmark: CanvasBookmark;
  faviconUrl?: string | null;
  onOpen: (url: string) => void;
  onOpenArchive: (id: number) => void;
  onRemovePin: (bookmarkId: number) => void;
  [key: string]: unknown;
}

function BookmarkCardInner(props: NodeProps) {
  const data = props.data as BookmarkNodeData;
  const { bookmark, faviconUrl, onOpen, onOpenArchive, onRemovePin } = data;
  const tags = bookmark.tags ? bookmark.tags.split(",").filter(Boolean) : [];
  const hasArchive = !!bookmark.snapshot_path;

  return (
    <div className="bookmark-card">
      <div className="bookmark-card-header">
        <BookmarkIcon
          bookmark={bookmark}
          storedFavicon={faviconUrl}
          imgClassName="bookmark-card-favicon"
          glyphClassName="bookmark-card-favicon-placeholder bookmark-card-favicon-glyph"
        />
        <span className="bookmark-card-title" title={bookmark.title}>
          {bookmark.title || bookmark.url}
        </span>
      </div>
      {bookmark.description && (
        <p className="bookmark-card-desc">{bookmark.description.slice(0, 80)}</p>
      )}
      {tags.length > 0 && (
        <div className="bookmark-card-tags">
          {tags.slice(0, 4).map((t: string) => (
            <span key={t} className="tag-pill">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="bookmark-card-actions">
        <button type="button" onClick={() => onOpen(bookmark.url)} title="Open live">
          Open
        </button>
        {hasArchive && (
          <button type="button" onClick={() => onOpenArchive(bookmark.id)} title="Open Inix Archive">
            Archive
          </button>
        )}
        {!hasArchive && <span className="bookmark-live-only">Live only</span>}
        <button
          type="button"
          className="bookmark-card-remove"
          onClick={() => onRemovePin(bookmark.id)}
          title="Remove from canvas"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export const BookmarkCardNode = memo(BookmarkCardInner);
