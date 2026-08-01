import { useCallback, useEffect, useRef, useState } from "react";

interface FindBarProps {
  open: boolean;
  tabId: string;
  onClose: () => void;
}

export function FindBar({ open, tabId, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const runFind = useCallback(
    (text: string, forward = true) => {
      if (!text.trim()) {
        setMatches(0);
        setActive(0);
        void window.inix?.find.stop(tabId);
        return;
      }
      void window.inix?.find.start(tabId, text, forward);
    },
    [tabId]
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMatches(0);
      setActive(0);
      void window.inix?.find.stop(tabId);
    }
  }, [open, tabId]);

  useEffect(() => {
    const unsub = window.inix?.find.onResult((result) => {
      if (result.tabId !== tabId) return;
      setMatches(result.matches);
      setActive(result.activeMatchOrdinal);
    });
    return () => unsub?.();
  }, [tabId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Find in page…"
        onChange={(e) => {
          setQuery(e.target.value);
          runFind(e.target.value, true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runFind(query, !e.shiftKey);
          }
        }}
      />
      <span className="find-count">
        {matches > 0 ? `${active} of ${matches}` : query ? "No matches" : ""}
      </span>
      <button type="button" onClick={() => runFind(query, false)} title="Previous">
        ↑
      </button>
      <button type="button" onClick={() => runFind(query, true)} title="Next">
        ↓
      </button>
      <button type="button" className="find-close" onClick={onClose} aria-label="Close find">
        ✕
      </button>
    </div>
  );
}
