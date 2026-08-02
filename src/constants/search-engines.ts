export type SearchEngineId =
  | "duckduckgo"
  | "google"
  | "bing"
  | "brave"
  | "ecosia"
  | "startpage"
  | "custom";

export interface SearchEngineOption {
  id: SearchEngineId;
  label: string;
  template: string;
}

export const SEARCH_ENGINES: SearchEngineOption[] = [
  { id: "duckduckgo", label: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s" },
  { id: "google", label: "Google", template: "https://www.google.com/search?q=%s" },
  { id: "bing", label: "Bing", template: "https://www.bing.com/search?q=%s" },
  { id: "brave", label: "Brave Search", template: "https://search.brave.com/search?q=%s" },
  { id: "ecosia", label: "Ecosia", template: "https://www.ecosia.org/search?q=%s" },
  { id: "startpage", label: "Startpage", template: "https://www.startpage.com/sp/search?q=%s" },
  { id: "custom", label: "Custom", template: "" },
];

export function buildSearchUrl(
  query: string,
  engineId: SearchEngineId,
  customTemplate?: string
): string {
  const trimmed = query.trim();
  if (!trimmed) return "inix://newtab";

  if (engineId === "custom") {
    const template = customTemplate?.trim();
    if (template && template.includes("%s")) {
      return template.replace(/%s/g, encodeURIComponent(trimmed));
    }
    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
  }

  const engine = SEARCH_ENGINES.find((e) => e.id === engineId);
  const template = engine?.template ?? SEARCH_ENGINES[0].template;
  return template.replace(/%s/g, encodeURIComponent(trimmed));
}
