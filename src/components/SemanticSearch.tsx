import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult } from "../inix.d";

interface SemanticSearchProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}

export function SemanticSearch({ open, onClose, onNavigate }: SemanticSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await window.inix?.search.semantic(q.trim(), 15);
      setResults(res ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <header className="search-header">
          <span className="search-icon">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search(query);
              if (e.key === "Escape") onClose();
            }}
            placeholder='Search your history… e.g. "the CSS flexbox guide last week"'
            spellCheck={false}
          />
          <button className="search-close" onClick={onClose}>✕</button>
        </header>

        {loading && <p className="search-loading">Searching locally…</p>}

        <ul className="search-results">
          {results.map((r) => (
            <li key={r.url + r.visited_at}>
              <button
                className="search-result"
                onClick={() => {
                  onNavigate(r.url);
                  onClose();
                }}
              >
                <span className="search-result-title">{r.title || r.url}</span>
                <span className="search-result-url">{r.url}</span>
                {r.snippet && <span className="search-result-snippet">{r.snippet}</span>}
                <span className="search-result-date">
                  {new Date(r.visited_at).toLocaleDateString()}
                  {r.score > 0 && ` · ${Math.round(r.score * 100)}% match`}
                </span>
              </button>
            </li>
          ))}
          {!loading && query && results.length === 0 && (
            <li className="search-empty">No results found. Visit more pages to build your index.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
