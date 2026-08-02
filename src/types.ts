import { buildSearchUrl, type SearchEngineId } from "./constants/search-engines";

export interface Tab {

  id: string;

  title: string;

  url: string;

  favicon?: string;

  isLoading: boolean;

  canGoBack: boolean;

  canGoForward: boolean;

  navKey: number;

  private?: boolean;

  parentId?: string | null;

  children?: string[];

  frozen?: boolean;

  scrollY?: number;

  pinned?: boolean;

  secure?: boolean;

  zoomLevel?: number;

  securityState?: "secure" | "insecure" | "warning" | "unknown";

  securityDetail?: string;

  audible?: boolean;

  muted?: boolean;

  groupId?: string;

  groupName?: string;

  groupColor?: string;

}



export interface SessionTabNode {

  id: string;

  url: string;

  title: string;

  private?: boolean;

  parentId?: string | null;

  children: string[];

  order: number;

  scrollY?: number;

  frozen?: boolean;

  pinned?: boolean;

  lastActiveAt: number;

}



export interface SessionSnapshot {

  version: 1;

  activeTabId: string;

  rootTabIds: string[];

  nodes: Record<string, SessionTabNode>;

  savedAt: number;

  cleanShutdown?: boolean;

}



let aliasMap: Record<string, string> = {};

let searchEngineId: SearchEngineId = "duckduckgo";
let customSearchUrl = "";

// Keyword search: "g cats" → Google search for cats, etc.
const KEYWORD_TEMPLATES: Record<string, string> = {
  g: "https://www.google.com/search?q=%s",
  google: "https://www.google.com/search?q=%s",
  ddg: "https://duckduckgo.com/?q=%s",
  bing: "https://www.bing.com/search?q=%s",
  yt: "https://www.youtube.com/results?search_query=%s",
  youtube: "https://www.youtube.com/results?search_query=%s",
  w: "https://en.wikipedia.org/wiki/Special:Search?search=%s",
  wiki: "https://en.wikipedia.org/wiki/Special:Search?search=%s",
  gh: "https://github.com/search?q=%s",
  github: "https://github.com/search?q=%s",
  npm: "https://www.npmjs.com/search?q=%s",
  mdn: "https://developer.mozilla.org/en-US/search?q=%s",
  so: "https://stackoverflow.com/search?q=%s",
  a: "https://www.amazon.com/s?k=%s",
  amazon: "https://www.amazon.com/s?k=%s",
  r: "https://www.reddit.com/search/?q=%s",
  reddit: "https://www.reddit.com/search/?q=%s",
  map: "https://www.google.com/maps/search/%s",
  x: "https://x.com/search?q=%s",
  twitter: "https://x.com/search?q=%s",
};

export function setSearchEngineConfig(engine: SearchEngineId, customUrl = ""): void {
  searchEngineId = engine;
  customSearchUrl = customUrl;
}



export function setAliasMap(map: Record<string, string>): void {

  aliasMap = map;

}



export function getAliasMap(): Record<string, string> {

  return aliasMap;

}



export function createTab(

  url = "inix://newtab",

  isPrivate = false,

  parentId?: string | null

): Tab {

  return {

    id: crypto.randomUUID(),

    title: isPrivate ? "Private Tab" : "New Tab",

    url,

    isLoading: false,

    canGoBack: false,

    canGoForward: false,

    navKey: 0,

    private: isPrivate || undefined,

    parentId: parentId ?? null,

    children: [],

  };

}



export function flattenTabsFromSnapshot(snapshot: SessionSnapshot): Tab[] {

  const result: Tab[] = [];

  const visit = (id: string) => {

    const node = snapshot.nodes[id];

    if (!node) return;

    result.push({

      id: node.id,

      title: node.title,

      url: node.url,

      isLoading: false,

      canGoBack: false,

      canGoForward: false,

      navKey: 0,

      private: node.private,

      parentId: node.parentId ?? null,

      children: node.children,

      frozen: node.frozen,

      scrollY: node.scrollY,

      pinned: node.pinned,

    });

    for (const childId of node.children) visit(childId);

  };

  for (const rootId of snapshot.rootTabIds) visit(rootId);

  return result;

}



export function buildSessionSnapshot(tabs: Tab[], activeTabId: string): SessionSnapshot {

  const now = Date.now();

  const nodes: Record<string, SessionTabNode> = {};

  const rootTabIds: string[] = [];



  for (let i = 0; i < tabs.length; i++) {

    const t = tabs[i];

    nodes[t.id] = {

      id: t.id,

      url: t.url,

      title: t.title,

      private: t.private,

      parentId: t.parentId ?? null,

      children: t.children ?? [],

      order: i,

      scrollY: t.scrollY,

      frozen: t.frozen,

      pinned: t.pinned,

      lastActiveAt: now,

    };

    if (!t.parentId) rootTabIds.push(t.id);

  }



  return {

    version: 1,

    activeTabId,

    rootTabIds,

    nodes,

    savedAt: now,

    cleanShutdown: false,

  };

}



export function resolveQuickRoute(input: string): string | null {

  const trimmed = input.trim().toLowerCase();

  if (!trimmed || trimmed.includes(" ") || trimmed.includes(".")) return null;

  return aliasMap[trimmed] ?? null;

}



export function normalizeUrl(input: string): string {

  const trimmed = input.trim();

  if (!trimmed) return "inix://newtab";



  if (trimmed.startsWith("inix://")) return trimmed;



  const aliasUrl = resolveQuickRoute(trimmed);

  if (aliasUrl) return aliasUrl;



  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Keyword search: "g cats", "yt music"
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx > 0) {
    const kw = trimmed.slice(0, spaceIdx).toLowerCase();
    const rest = trimmed.slice(spaceIdx + 1).trim();
    const template = KEYWORD_TEMPLATES[kw];
    if (template && rest) {
      return template.replace(/%s/g, encodeURIComponent(rest));
    }
  }

  if (trimmed.includes(".") && !trimmed.includes(" ")) {

    return `https://${trimmed}`;

  }



  return buildSearchUrl(trimmed, searchEngineId, customSearchUrl);
}



export function isNewTabUrl(url: string): boolean {

  return url === "inix://newtab" || url === "about:blank";

}



export function isLibraryUrl(url: string): boolean {

  return url === "inix://library";

}



export function isSettingsUrl(url: string): boolean {
  return url.split("#")[0]?.split("?")[0] === "inix://settings";
}



export function isShellUrl(url: string): boolean {

  return isNewTabUrl(url) || isLibraryUrl(url) || isSettingsUrl(url);

}



export function isArchiveUrl(url: string): boolean {

  return url.startsWith("inix://archive/");

}



export type HistoryTier = "standard" | "transient" | "vaulted";



export interface HistoryEntry {

  id: number;

  url: string;

  title: string;

  visited_at: number;

  content_id: number | null;

  tier: HistoryTier;

  session_id: string | null;

}



export interface VaultEntry {

  id: number;

  url: string;

  title: string;

  visited_at: number;

  text?: string;

}


