export type QuickLinkIconMode = "favicon" | "letter";

export interface QuickLink {
  label: string;
  url: string;
  icon?: QuickLinkIconMode;
}

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: "DuckDuckGo", url: "https://duckduckgo.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Reddit", url: "https://reddit.com" },
  { label: "Hacker News", url: "https://news.ycombinator.com" },
];

export const DEFAULT_QUICK_LINKS_JSON = JSON.stringify(DEFAULT_QUICK_LINKS);

export function parseQuickLinks(raw: string | undefined | null): QuickLink[] {
  if (!raw?.trim()) return DEFAULT_QUICK_LINKS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_LINKS;
    const links = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const label = typeof row.label === "string" ? row.label.trim() : "";
        const url = typeof row.url === "string" ? row.url.trim() : "";
        if (!label || !url) return null;
        const link: QuickLink = {
          label,
          url: normalizeQuickLinkUrl(url),
        };
        if (row.icon === "letter") link.icon = "letter";
        return link;
      })
      .filter((item): item is QuickLink => item != null);
    return links.length ? links : DEFAULT_QUICK_LINKS;
  } catch {
    return DEFAULT_QUICK_LINKS;
  }
}

export function normalizeQuickLinkUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function quickLinkIconMode(link: QuickLink): QuickLinkIconMode {
  return link.icon === "letter" ? "letter" : "favicon";
}

/** First letter from the link hostname (fallback: label). */
export function quickLinkGlyph(link: QuickLink): string {
  try {
    const host = new URL(normalizeQuickLinkUrl(link.url)).hostname.replace(/^www\./, "");
    const part = host.split(".")[0];
    if (part) return part.charAt(0).toUpperCase();
  } catch {
    // fall through
  }
  return link.label.charAt(0).toUpperCase() || "◆";
}

export function quickLinkFaviconUrl(url: string): string {
  try {
    const hostname = new URL(normalizeQuickLinkUrl(url)).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return "";
  }
}

export function serializeQuickLink(link: QuickLink): QuickLink {
  const row: QuickLink = {
    label: link.label.trim(),
    url: normalizeQuickLinkUrl(link.url),
  };
  if (link.icon === "letter") row.icon = "letter";
  return row;
}

export function serializeQuickLinks(links: QuickLink[]): QuickLink[] {
  return links.map(serializeQuickLink).filter((link) => link.label && link.url);
}
