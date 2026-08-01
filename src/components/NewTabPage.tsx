import { useState, type FormEvent, type KeyboardEvent } from "react";
import { InixLogo } from "./InixLogo";

interface NewTabPageProps {
  onNavigate: (url: string) => void | Promise<void>;
  onOpenSearch: () => void;
  onOpenLibrary: () => void;
}

const QUICK_LINKS = [
  { label: "DuckDuckGo", url: "https://duckduckgo.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Reddit", url: "https://reddit.com" },
  { label: "Hacker News", url: "https://news.ycombinator.com" },
];

export function NewTabPage({ onNavigate, onOpenSearch, onOpenLibrary }: NewTabPageProps) {
  const [query, setQuery] = useState("");

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      onOpenSearch();
      return;
    }
    void onNavigate(trimmed);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="new-tab">
      <InixLogo height={128} className="new-tab-logo-img" />
      <p className="new-tab-tagline">Fast. Private. Yours.</p>
      <form className="new-tab-search" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search, quick route, or URL · / for history"
          autoFocus
          spellCheck={false}
        />
      </form>
      <button className="new-tab-history-search" onClick={onOpenLibrary}>
        ★ Open Inix Library
      </button>
      <button className="new-tab-history-search secondary" onClick={onOpenSearch}>
        ⌕ Search browsing history with AI
      </button>
      <div className="quick-links">
        {QUICK_LINKS.map((link) => (
          <button key={link.url} className="quick-link" onClick={() => void onNavigate(link.url)}>
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
}
