import { useEffect, useMemo, useRef, useState } from "react";
import { DismissibleOverlay } from "./DismissibleOverlay";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  category?: string;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

function fuzzyMatch(query: string, str: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  if (s.startsWith(q)) return 100;
  if (s.includes(q)) return 60;
  // subsequence match
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 30;
  return -1;
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((c) => {
        const scoreLabel = fuzzyMatch(query, c.label);
        const scoreKeywords = c.keywords ? fuzzyMatch(query, c.keywords) : -1;
        const score = Math.max(scoreLabel, scoreKeywords);
        return { c, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(`li[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        onClose();
        cmd.run();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <DismissibleOverlay onDismiss={onClose}>
      <div className="command-palette" onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command or search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <ul className="command-palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <li className="command-palette-empty">No matching commands</li>
          ) : (
            filtered.map((cmd, i) => (
              <li
                key={cmd.id}
                data-idx={i}
                className={`command-palette-item${i === activeIndex ? " active" : ""}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  onClose();
                  cmd.run();
                }}
              >
                <div className="command-palette-item-main">
                  <span className="command-palette-item-label">{cmd.label}</span>
                  {cmd.hint && <span className="command-palette-item-hint">{cmd.hint}</span>}
                </div>
                <div className="command-palette-item-meta">
                  {cmd.category && <span className="command-palette-item-category">{cmd.category}</span>}
                  {cmd.shortcut && <kbd className="command-palette-item-shortcut">{cmd.shortcut}</kbd>}
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="command-palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </DismissibleOverlay>
  );
}
