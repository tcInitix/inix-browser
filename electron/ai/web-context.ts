import { extractPageInMain } from "../storage/page-extractor";
import { shouldSearchWebForMessage } from "./casual-chat";
import { getSetting } from "../storage/settings";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 12_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  source: "url" | "search";
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextFallback(html: string, url: string): { title: string; url: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : url;
  const text = stripTags(html).slice(0, MAX_PAGE_CHARS);
  return { title, url, text };
}

function extractPageSafe(html: string, url: string): { title: string; url: string; text: string } {
  try {
    const extracted = extractPageInMain(html, url);
    if (extracted.text.trim()) return extracted;
  } catch {
    // jsdom/undici may be incompatible with Electron — use fallback
  }
  return extractTextFallback(html, url);
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, "")))];
}

export function searchQueryFromMessage(message: string): string {
  let q = message.trim();
  q = q.replace(
    /^(can you |could you |please |what is |what's |whats |what are |tell me |look up |find |search for )+/i,
    ""
  );
  q = q.replace(/\?+$/, "").trim();
  return q.slice(0, 200);
}

export function getDateAnchor(): {
  year: number;
  month: string;
  dateStr: string;
  isoDate: string;
} {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.toLocaleDateString("en-US", { month: "long" }),
    dateStr: now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    isoDate: now.toISOString().slice(0, 10),
  };
}

const TIME_SENSITIVE_RE =
  /\b(latest|newest|new|upcoming|coming out|releases?|this year|today|now|current|recent|announce|premiere|opening|box office|news|weather|price|patch|version|update|movies|films|albums|games|shows)\b/i;

/** Bias DuckDuckGo toward the current year/month for time-sensitive questions. */
export function buildWebSearchQuery(message: string): string {
  let q = searchQueryFromMessage(message);
  const anchor = getDateAnchor();

  if (!TIME_SENSITIVE_RE.test(message) && !TIME_SENSITIVE_RE.test(q)) {
    return q;
  }

  if (!/\b20\d{2}\b/.test(q)) {
    q = `${q} ${anchor.year}`;
  }

  if (/\b(latest|new|upcoming|coming out|releases?|movies|films|albums|games|shows|news)\b/i.test(q)) {
    if (!new RegExp(`\\b${anchor.month}\\b`, "i").test(q)) {
      q = `${q} ${anchor.month}`;
    }
  }

  return q.trim().slice(0, 200);
}

function decodeDdgUrl(href: string): string {
  try {
    const decoded = href.replace(/&amp;/g, "&");
    if (decoded.startsWith("//")) href = `https:${decoded}`;
    else href = decoded;
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (u.hostname !== "duckduckgo.com") return u.href;
  } catch {
    // fall through
  }
  return href;
}

/** Parse DuckDuckGo HTML without jsdom (Electron-safe). */
function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRe =
    /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null && results.length < limit) {
    const href = decodeDdgUrl(match[1]);
    if (!href.startsWith("http")) continue;
    results.push({
      title: stripTags(match[2]),
      url: href,
      snippet: stripTags(match[3]),
    });
  }

  if (results.length > 0) return results;

  const fallbackRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = fallbackRe.exec(html)) !== null && results.length < limit) {
    const href = decodeDdgUrl(match[1]);
    if (!href.startsWith("http")) continue;
    results.push({
      title: stripTags(match[2]),
      url: href,
      snippet: "",
    });
  }

  return results;
}

export async function searchWeb(query: string, limit = 5): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const backend = getSetting("ai_search_backend") || "duckduckgo";

  try {
    if (backend === "brave") {
      const key = getSetting("ai_search_brave_key").trim();
      if (key) {
        const results = await searchBrave(query, limit, key);
        if (results.length > 0) return results;
      }
      // fall through to DDG on missing key / empty
    }
    if (backend === "searxng") {
      const host = getSetting("ai_search_searxng_url").trim();
      if (host) {
        const results = await searchSearxng(query, limit, host);
        if (results.length > 0) return results;
      }
    }
  } catch {
    // fall back to DDG below
  }

  return searchDuckDuckGo(query, limit);
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const body = new URLSearchParams({ q: query.trim(), b: "", kl: "" });
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": BROWSER_UA,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) return [];
  return parseDdgHtml(await res.text(), limit);
}

async function searchBrave(query: string, limit: number, key: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const rows = data.web?.results ?? [];
  return rows.slice(0, limit).map((r) => ({
    title: stripTags(r.title ?? ""),
    url: r.url ?? "",
    snippet: stripTags(r.description ?? ""),
  })).filter((r) => r.url.startsWith("http"));
}

async function searchSearxng(query: string, limit: number, host: string): Promise<SearchResult[]> {
  const base = host.replace(/\/+$/, "");
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const rows = data.results ?? [];
  return rows.slice(0, limit).map((r) => ({
    title: stripTags(r.title ?? ""),
    url: r.url ?? "",
    snippet: stripTags(r.content ?? ""),
  })).filter((r) => r.url.startsWith("http"));
}

export async function fetchUrlContent(url: string): Promise<FetchedPage | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const extracted = extractPageSafe(html, res.url || url);
    if (!extracted.text.trim()) return null;

    return {
      url: extracted.url,
      title: extracted.title,
      text: extracted.text.slice(0, MAX_PAGE_CHARS),
      source: "url",
    };
  } catch {
    return null;
  }
}

function formatSearchResults(results: SearchResult[]): string {
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");
}

function formatPage(page: FetchedPage): string {
  return `Title: ${page.title}\nURL: ${page.url}\n\n${page.text}`;
}

export async function gatherWebContext(userMessage: string): Promise<string | null> {
  const parts: string[] = [];
  let totalChars = 0;

  const addPart = (text: string) => {
    if (totalChars >= MAX_TOTAL_CHARS) return;
    const slice = text.slice(0, MAX_TOTAL_CHARS - totalChars);
    parts.push(slice);
    totalChars += slice.length;
  };

  const urls = extractUrls(userMessage);
  const fetchedUrls = new Set<string>();

  for (const url of urls.slice(0, 2)) {
    const page = await fetchUrlContent(url);
    if (page) {
      fetchedUrls.add(page.url);
      addPart(`Fetched URL:\n${formatPage(page)}`);
    }
  }

  const query = buildWebSearchQuery(userMessage);
  const anchor = getDateAnchor();
  const timeSensitive = TIME_SENSITIVE_RE.test(userMessage) || TIME_SENSITIVE_RE.test(query);
  const fetchLimit = timeSensitive ? 3 : 2;

  if (query.length >= 3 && shouldSearchWebForMessage(userMessage, urls.length > 0)) {
    const results = await searchWeb(query, 5);
    if (results.length > 0) {
      addPart(
        `Web search date: ${anchor.dateStr} (${anchor.isoDate})\nSearch query: "${query}"\n\nTop results:\n${formatSearchResults(results)}`
      );

      for (const hit of results.slice(0, fetchLimit)) {
        if (fetchedUrls.has(hit.url)) continue;
        const page = await fetchUrlContent(hit.url);
        if (page) {
          fetchedUrls.add(page.url);
          addPart(`Fetched from search (${anchor.isoDate}):\n${formatPage(page)}`);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

export interface WebGatherResult {
  context: string | null;
  status: "ok" | "empty" | "error";
  detail?: string;
}

export async function gatherWebContextSafe(userMessage: string): Promise<WebGatherResult> {
  try {
    const context = await gatherWebContext(userMessage);
    if (!context) {
      return { context: null, status: "empty", detail: "No results found" };
    }
    return { context, status: "ok" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { context: null, status: "error", detail };
  }
}
