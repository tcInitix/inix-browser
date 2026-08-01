import { semanticSearch, type SearchResult } from "./vector-index";
import { getRecentHistory, searchHistoryKeyword, searchHistoryFts } from "./history";

export async function searchSemantic(query: string, limit = 10): Promise<SearchResult[]> {
  try {
    const results = await semanticSearch(query, limit);
    if (results.length > 0) return results;
  } catch {
    // fall through to keyword search
  }
  const keyword = searchHistoryFts(query, "standard", limit);
  if (keyword.length === 0) {
    return searchHistoryKeyword(query, limit, "standard").map((h) => ({
      url: h.url,
      title: h.title,
      snippet: h.url,
      visited_at: h.visited_at,
      score: 0.5,
    }));
  }
  return keyword.map((h) => ({
    url: h.url,
    title: h.title,
    snippet: h.url,
    visited_at: h.visited_at,
    score: 0.5,
  }));
}
export function searchRecent(limit = 20) {
  return getRecentHistory(limit);
}
