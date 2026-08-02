import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { InixLogo } from "./InixLogo";
import { QuickLinkIcon } from "./QuickLinkIcon";
import {
  normalizeQuickLinkUrl,
  parseQuickLinks,
  quickLinkIconMode,
  serializeQuickLinks,
  type QuickLink,
} from "../constants/quick-links";

interface NewTabPageProps {
  onNavigate: (url: string) => void | Promise<void>;
  onOpenSearch: () => void;
  onOpenLibrary: () => void;
}

const MAX_QUICK_LINKS = 12;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function NewTabPage({ onNavigate, onOpenSearch, onOpenLibrary }: NewTabPageProps) {
  const [query, setQuery] = useState("");
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [editing, setEditing] = useState(false);
  const [showSearch, setShowSearch] = useState(true);
  const [showQuickLinks, setShowQuickLinks] = useState(true);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const salutation = useMemo(() => greeting(), []);

  useEffect(() => {
    void window.inix?.settings.getFormatted().then((s) => {
      if (!s) return;
      setLinks(parseQuickLinks(JSON.stringify(s.new_tab_quick_links)));
      setShowSearch(s.new_tab_show_search);
      setShowQuickLinks(s.new_tab_show_quick_links);
    });
  }, []);

  const persistLinks = useCallback(async (next: QuickLink[]) => {
    const cleaned = serializeQuickLinks(next);
    setLinks(cleaned);
    await window.inix?.settings.set("new_tab_quick_links", JSON.stringify(cleaned));
  }, []);

  const replaceLinks = (next: QuickLink[]) => {
    setLinks(next);
  };

  const commitLinks = (next: QuickLink[]) => {
    void persistLinks(next);
  };

  const updateLinkField = (index: number, patch: Partial<QuickLink>) => {
    replaceLinks(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  };

  const finalizeLinkRow = (index: number, patch: Partial<QuickLink>) => {
    const next = links.map((link, i) => (i === index ? { ...link, ...patch } : link));
    commitLinks(next);
  };

  const toggleLinkIcon = (index: number) => {
    const next = links.map((link, i) => {
      if (i !== index) return link;
      if (quickLinkIconMode(link) === "letter") {
        return { label: link.label, url: link.url };
      }
      return { ...link, icon: "letter" as const };
    });
    commitLinks(next);
  };

  const removeLink = (index: number) => {
    void persistLinks(links.filter((_, i) => i !== index));
  };

  const addLink = () => {
    const label = draftLabel.trim();
    const url = normalizeQuickLinkUrl(draftUrl);
    if (!label || !url || links.length >= MAX_QUICK_LINKS) return;
    void persistLinks([...links, { label, url }]);
    setDraftLabel("");
    setDraftUrl("");
  };

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
    <div className="new-tab inix-page">
      <div className="new-tab-ambient" aria-hidden="true" />
      <div className="new-tab-shell">
        <header className="new-tab-hero">
          <p className="new-tab-greeting">{salutation}</p>
          <div className="new-tab-logo-wrap">
            <div className="new-tab-glow" aria-hidden="true" />
            <InixLogo height={220} className="new-tab-logo-img" />
          </div>
        </header>

        {showSearch && (
          <>
            <form className="new-tab-search" onSubmit={handleSubmit}>
              <span className="new-tab-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search, quick route, or URL"
                spellCheck={false}
              />
              <kbd className="new-tab-search-hint">/</kbd>
            </form>
            <p className="new-tab-search-caption">Press Enter to go · / opens history search</p>
          </>
        )}

        <div className="new-tab-actions">
          <button type="button" className="new-tab-action inix-btn-primary" onClick={onOpenLibrary}>
            <span className="new-tab-action-icon" aria-hidden="true">
              ★
            </span>
            Open Library
          </button>
          <button type="button" className="new-tab-action inix-btn-ghost" onClick={onOpenSearch}>
            <span className="new-tab-action-icon" aria-hidden="true">
              ⌕
            </span>
            Search history
          </button>
        </div>

        {showQuickLinks && (
        <section className={`new-tab-shortcuts${editing ? " is-editing" : ""}`} aria-label="Quick links">
          <div className="new-tab-shortcuts-head">
            <p className="new-tab-shortcuts-label">Quick links</p>
            <button
              type="button"
              className="new-tab-shortcuts-edit"
              onClick={() => {
                setEditing((value) => !value);
                setDraftLabel("");
                setDraftUrl("");
              }}
            >
              {editing ? "Done" : "Edit"}
            </button>
          </div>

          {editing ? (
            <div className="quick-links-editor">
              <ul className="quick-links-edit-list">
                {links.map((link, index) => (
                  <li key={`${link.url}-${index}`} className="quick-link-edit-row">
                    <button
                      type="button"
                      className="quick-link-icon-toggle"
                      title={
                        quickLinkIconMode(link) === "letter"
                          ? "Use site favicon"
                          : "Use letter instead of favicon"
                      }
                      onClick={() => toggleLinkIcon(index)}
                    >
                      <QuickLinkIcon
                        link={link}
                        imgClassName="quick-link-icon-img quick-link-edit-icon-img"
                        glyphClassName="quick-link-glyph quick-link-edit-glyph-inner"
                      />
                    </button>
                    <label className="quick-link-edit-field">
                      <span className="sr-only">Label</span>
                      <input
                        type="text"
                        value={link.label}
                        placeholder="Label"
                        onChange={(e) => updateLinkField(index, { label: e.target.value })}
                        onBlur={(e) => finalizeLinkRow(index, { label: e.target.value })}
                      />
                    </label>
                    <label className="quick-link-edit-field quick-link-edit-field-url">
                      <span className="sr-only">URL</span>
                      <input
                        type="text"
                        value={link.url}
                        placeholder="https://…"
                        spellCheck={false}
                        onChange={(e) => updateLinkField(index, { url: e.target.value })}
                        onBlur={(e) => finalizeLinkRow(index, { url: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="quick-link-remove"
                      title="Remove link"
                      onClick={() => removeLink(index)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              {links.length < MAX_QUICK_LINKS && (
                <div className="quick-link-add-row">
                  <span className="quick-link-edit-glyph quick-link-edit-glyph-add" aria-hidden="true">
                    +
                  </span>
                  <label className="quick-link-edit-field">
                    <span className="sr-only">New label</span>
                    <input
                      type="text"
                      value={draftLabel}
                      placeholder="New label"
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addLink();
                        }
                      }}
                    />
                  </label>
                  <label className="quick-link-edit-field quick-link-edit-field-url">
                    <span className="sr-only">New URL</span>
                    <input
                      type="text"
                      value={draftUrl}
                      placeholder="https://…"
                      spellCheck={false}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addLink();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="quick-link-add-btn"
                    disabled={!draftLabel.trim() || !draftUrl.trim()}
                    onClick={addLink}
                  >
                    Add
                  </button>
                </div>
              )}
              <p className="new-tab-shortcuts-hint">
                Click an icon to switch between site favicon and letter. Changes save automatically.
              </p>
            </div>
          ) : links.length > 0 ? (
            <div className="quick-links">
              {links.map((link) => (
                <button
                  key={link.url + link.label}
                  type="button"
                  className="quick-link"
                  onClick={() => void onNavigate(link.url)}
                >
                  <QuickLinkIcon link={link} />
                  <span className="quick-link-label">{link.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="new-tab-shortcuts-empty">No shortcuts yet — click Edit to add your favorites.</p>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
