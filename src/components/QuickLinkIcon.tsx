import { useEffect, useState } from "react";
import {
  quickLinkFaviconUrl,
  quickLinkGlyph,
  quickLinkIconMode,
  type QuickLink,
} from "../constants/quick-links";

interface QuickLinkIconProps {
  link: QuickLink;
  className?: string;
  imgClassName?: string;
  glyphClassName?: string;
}

export function QuickLinkIcon({
  link,
  className = "",
  imgClassName = "quick-link-icon-img",
  glyphClassName = "quick-link-glyph",
}: QuickLinkIconProps) {
  const mode = quickLinkIconMode(link);
  const faviconUrl = quickLinkFaviconUrl(link.url);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    setFaviconFailed(false);
  }, [link.url, mode]);

  const showLetter = mode === "letter" || faviconFailed || !faviconUrl;

  if (!showLetter) {
    return (
      <img
        className={`${imgClassName}${className ? ` ${className}` : ""}`}
        src={faviconUrl}
        alt=""
        draggable={false}
        onError={() => setFaviconFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${glyphClassName}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {quickLinkGlyph(link)}
    </span>
  );
}
