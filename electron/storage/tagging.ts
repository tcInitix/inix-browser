import type { PageMeta } from "./meta-scraper";

const HOST_TAGS: Record<string, string[]> = {
  "github.com": ["dev"],
  "stackoverflow.com": ["dev"],
  "news.ycombinator.com": ["dev", "read-later"],
  "reddit.com": ["read-later"],
  "medium.com": ["read-later"],
  "substack.com": ["read-later"],
};

const PATH_TAGS: Array<[RegExp, string]> = [
  [/\/finance/i, "finance"],
  [/\/news/i, "news"],
  [/\/docs/i, "dev"],
  [/\/blog/i, "read-later"],
];

function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, "").trim().toLowerCase();
}

export function parseTagsFromTitle(title: string): { cleanTitle: string; tags: string[] } {
  const tags: string[] = [];
  const cleanTitle = title.replace(/\s+#([\w-]+)/g, (_, tag: string) => {
    tags.push(normalizeTag(tag));
    return "";
  }).trim();
  return { cleanTitle: cleanTitle || title, tags };
}

export function extractAutoTags(meta: PageMeta, userTags: string[] = []): string[] {
  const tags = new Set<string>(userTags.map(normalizeTag).filter(Boolean));

  for (const t of meta.keywords) tags.add(normalizeTag(t));
  for (const t of meta.articleTags) tags.add(normalizeTag(t));

  try {
    const u = new URL(meta.url);
    const hostTags = HOST_TAGS[u.hostname.replace(/^www\./, "")];
    if (hostTags) hostTags.forEach((t) => tags.add(t));
    for (const [re, tag] of PATH_TAGS) {
      if (re.test(u.pathname)) tags.add(tag);
    }
  } catch {
    // ignore invalid URL
  }

  return [...tags].slice(0, 12);
}

export async function suggestTagsWithEngine(
  _text: string
): Promise<string[]> {
  // Optional Local Engine suggestions — off by default; hook for future use
  return [];
}
