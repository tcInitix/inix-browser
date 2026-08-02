import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryEntry, HistoryTier, VaultEntry } from "../types";
import { VaultUnlockModal } from "./VaultUnlockModal";

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}

type TierFilter = "all" | HistoryTier;

function clearAllLabel(tier: TierFilter): string {
  switch (tier) {
    case "all":
      return "Clear all history";
    case "standard":
      return "Clear standard history";
    case "transient":
      return "Clear transient history";
    case "vaulted":
      return "Clear vault history";
  }
}

function clearAllMessage(tier: TierFilter): string {
  switch (tier) {
    case "all":
      return "Clear all browsing history, saved page snapshots, and search index? Vault entries are kept.";
    case "standard":
      return "Clear all standard history entries?";
    case "transient":
      return "Clear all transient history entries?";
    case "vaulted":
      return "Delete all vaulted history entries? This cannot be undone.";
  }
}

export function HistoryPanel({ open, onClose, onNavigate }: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [tier, setTier] = useState<TierFilter>("all");
  const [query, setQuery] = useState("");
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultConfigured, setVaultConfigured] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const loadHistory = useCallback(async () => {
    const tierArg = tier === "all" ? undefined : tier;
    const rows = await window.inix?.storage.historyList({
      limit: 100,
      tier: tierArg,
      query: query.trim() || undefined,
    });
    setEntries(rows ?? []);
  }, [tier, query]);

  const loadVault = useCallback(async () => {
    const unlocked = await window.inix?.vault.isUnlocked();
    setVaultUnlocked(!!unlocked);
    if (unlocked) {
      const rows = await window.inix?.vault.list(100);
      setVaultEntries(rows ?? []);
    } else {
      setVaultEntries([]);
    }
  }, []);

  useEffect(() => {
    if (open && !vaultOpen) listRef.current?.focus();
  }, [open, vaultOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    void window.inix?.vault.isConfigured().then(setVaultConfigured);
    if (tier === "vaulted") {
      void loadVault();
    } else {
      void loadHistory();
    }
  }, [open, tier, query, loadHistory, loadVault]);

  const moveToVault = async (id: number) => {
    const unlocked = await window.inix?.vault.isUnlocked();
    if (!unlocked) {
      setVaultOpen(true);
      return;
    }
    const result = await window.inix?.storage.historyMoveToVault(id);
    if (result?.ok) void loadHistory();
    else alert(result?.error ?? "Could not move to vault");
  };

  const deleteHistoryEntry = async (id: number) => {
    if (!confirm("Delete this history entry?")) return;
    await window.inix?.storage.historyDelete(id);
    void loadHistory();
  };

  const deleteVaultEntry = async (id: number) => {
    if (!confirm("Delete this vaulted entry?")) return;
    const result = await window.inix?.vault.deleteEntry(id);
    if (result?.ok) void loadVault();
    else alert(result?.error ?? "Could not delete entry");
  };

  const clearAll = async () => {
    if (!confirm(clearAllMessage(tier))) return;

    if (tier === "vaulted") {
      const result = await window.inix?.vault.clearHistory();
      if (result?.ok) void loadVault();
      else alert(result?.error ?? "Could not clear vault history");
      return;
    }

    const tierArg = tier === "all" ? undefined : tier;
    await window.inix?.storage.historyClear(tierArg);
    void loadHistory();
  };

  if (!open) return null;

  const showVault = tier === "vaulted";
  const displayEntries = showVault ? vaultEntries : entries;
  const canClear =
    displayEntries.length > 0 && (!showVault || vaultUnlocked);

  return (
    <>
      <div className="history-overlay" onClick={onClose}>
        <div className="history-panel" onClick={(e) => e.stopPropagation()}>
          <header className="history-header">
            <span className="history-icon">◷</span>
            <h2>Browsing History</h2>
            <span className="history-hint">Ctrl+H</span>
            <button className="history-close" onClick={onClose} aria-label="Close history">
              ✕
            </button>
          </header>

          <div className="history-toolbar">
            <input
              className="history-search"
              placeholder="Search history…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={showVault}
            />
            <div className="history-toolbar-row">
              <div className="history-tier-tabs">
                {(["all", "standard", "transient", "vaulted"] as TierFilter[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`history-tier-tab${tier === t ? " active" : ""}`}
                    onClick={() => {
                      if (t === "vaulted" && vaultConfigured && !vaultUnlocked) {
                        setVaultOpen(true);
                      }
                      setTier(t);
                    }}
                  >
                    {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="history-clear-btn"
                disabled={!canClear}
                onClick={() => void clearAll()}
              >
                {clearAllLabel(tier)}
              </button>
            </div>
          </div>

          <ul className="history-results" ref={listRef} tabIndex={-1}>
            {showVault
              ? vaultEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="history-result"
                      onClick={() => {
                        onNavigate(entry.url);
                        onClose();
                      }}
                    >
                      <span className="history-result-title">{entry.title || entry.url}</span>
                      <span className="history-result-url">{entry.url}</span>
                      <span className="history-result-date">
                        {new Date(entry.visited_at).toLocaleString()} · Vault
                      </span>
                    </button>
                    <div className="history-item-actions">
                      <button
                        type="button"
                        className="history-action-btn history-action-delete"
                        title="Delete entry"
                        aria-label="Delete entry"
                        onClick={() => void deleteVaultEntry(entry.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))
              : entries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="history-result"
                      onClick={() => {
                        onNavigate(entry.url);
                        onClose();
                      }}
                    >
                      <span className="history-result-title">{entry.title || entry.url}</span>
                      <span className="history-result-url">{entry.url}</span>
                      <span className="history-result-date">
                        {new Date(entry.visited_at).toLocaleString()}
                        {entry.tier !== "standard" && ` · ${entry.tier}`}
                      </span>
                    </button>
                    <div className="history-item-actions">
                      {entry.tier === "standard" && vaultConfigured && (
                        <button
                          type="button"
                          className="history-action-btn"
                          title="Move to vault"
                          aria-label="Move to vault"
                          onClick={() => void moveToVault(entry.id)}
                        >
                          🔒
                        </button>
                      )}
                      <button
                        type="button"
                        className="history-action-btn history-action-delete"
                        title="Delete entry"
                        aria-label="Delete entry"
                        onClick={() => void deleteHistoryEntry(entry.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
            {displayEntries.length === 0 && (
              <li className="history-empty">
                {showVault && !vaultUnlocked
                  ? "Unlock the vault to view protected history."
                  : "No history yet — browse the web to build your timeline."}
              </li>
            )}
          </ul>
        </div>
      </div>

      <VaultUnlockModal
        open={vaultOpen}
        onClose={() => setVaultOpen(false)}
        onUnlocked={() => {
          setVaultUnlocked(true);
          void loadVault();
          setTier("vaulted");
        }}
      />
    </>
  );
}
