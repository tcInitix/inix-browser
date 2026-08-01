export interface ExtractedLink {
  url: string;
  label?: string;
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const PLAIN_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/, "");
}

function isBrowsable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Pull https links from assistant text (markdown + plain). */
export function extractLinksFromText(text: string, max = 3): ExtractedLink[] {
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];

  const add = (url: string, label?: string) => {
    const cleaned = cleanUrl(url);
    if (!isBrowsable(cleaned) || seen.has(cleaned)) return;
    seen.add(cleaned);
    out.push({ url: cleaned, label: label?.trim() || undefined });
  };

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    add(match[2], match[1]);
    if (out.length >= max) return out;
  }

  for (const match of text.matchAll(PLAIN_URL_RE)) {
    add(match[0]);
    if (out.length >= max) return out;
  }

  return out;
}

const CASUAL_GREETING_RE =
  /^(hi|hello|hey|yo|sup|howdy|hiya|good\s+(morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|nice|lol|haha|bye|goodbye|goodnight|good night|how are you|what's up|whats up|how's it going)[!.?\s]*$/i;

/** Skip link-open prompts when the user's message was casual small talk. */
export function shouldOfferLinksForTurn(lastUserMessage?: string): boolean {
  if (!lastUserMessage?.trim()) return true;
  return !CASUAL_GREETING_RE.test(lastUserMessage.trim());
}

export function linkDisplayLabel(link: ExtractedLink): string {
  if (link.label) return link.label;
  try {
    const u = new URL(link.url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

export function splitMessageWithLinks(text: string): Array<{ type: "text" | "link"; value: string }> {
  const parts: Array<{ type: "text" | "link"; value: string }> = [];
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"')\]]+)/gi;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) });
    }
    if (match[3]) {
      parts.push({ type: "link", value: cleanUrl(match[3]) });
    } else {
      parts.push({ type: "link", value: cleanUrl(match[0]) });
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
}
