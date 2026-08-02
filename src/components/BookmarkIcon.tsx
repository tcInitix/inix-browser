import { useEffect, useState } from "react";
import type { Bookmark } from "../inix.d";
import {
  bookmarkGlyph,
  bookmarkIconMode,
  bookmarkRemoteFaviconUrl,
} from "../utils/bookmark-icon";

interface BookmarkIconProps {
  bookmark: Bookmark;
  storedFavicon?: string | null;
  imgClassName?: string;
  glyphClassName?: string;
  className?: string;
}

export function BookmarkIcon({
  bookmark,
  storedFavicon,
  imgClassName = "bookmark-bar-chip-icon",
  glyphClassName = "bookmark-bar-chip-glyph",
  className = "",
}: BookmarkIconProps) {
  const mode = bookmarkIconMode(bookmark);
  const remoteUrl = bookmarkRemoteFaviconUrl(bookmark.url);
  const [useRemote, setUseRemote] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUseRemote(false);
    setFailed(false);
  }, [bookmark.id, bookmark.url, bookmark.meta_json, storedFavicon]);

  if (mode === "letter") {
    return (
      <span
        className={`${glyphClassName}${className ? ` ${className}` : ""}`}
        aria-hidden="true"
      >
        {bookmarkGlyph(bookmark)}
      </span>
    );
  }

  const src = !useRemote && storedFavicon ? storedFavicon : remoteUrl;

  if (!src || failed) {
    return (
      <span
        className={`${glyphClassName}${className ? ` ${className}` : ""}`}
        aria-hidden="true"
      >
        {bookmarkGlyph(bookmark)}
      </span>
    );
  }

  return (
    <img
      className={`${imgClassName}${className ? ` ${className}` : ""}`}
      src={src}
      alt=""
      draggable={false}
      onError={() => {
        if (!useRemote && storedFavicon && remoteUrl) {
          setUseRemote(true);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
