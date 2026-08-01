import { useCallback, useEffect, useMemo, useState } from "react";
import type { EngineStatus, UrlAlias, SiteRecord, PermissionGrant } from "../inix.d";
import { RECOMMENDED_CHAT_MODELS, SUGGESTED_CHAT_MODEL } from "../constants/recommended-models";
import {
  chatModelsFromOllama,
  embedModelsFromOllama,
  isModelInstalled,
} from "../utils/ollama-models";
import { VaultUnlockModal } from "./VaultUnlockModal";

type AiProvider = "local" | "api";

const API_PRESETS = [
  { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "anthropic/claude-3.5-sonnet" },
  { label: "Groq", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Together", base: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
] as const;

type SettingsSection =
  | "ai"
  | "tabs"
  | "history"
  | "vault"
  | "autofill"
  | "profiles"
  | "library"
  | "routes"
  | "privacy"
  | "data";

interface StoredCredential {
  id: number;
  origin: string;
  username: string;
  title: string;
}

interface AutofillProfileMeta {
  id: number;
  label: string;
  is_default: boolean;
}

interface BrowserProfile {
  id: string;
  name: string;
  color: string;
}

interface AutofillFormData {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  cardNumber: string;
  cardName: string;
  cardExpiry: string;
  cardCvc: string;
}

const EMPTY_AUTOFILL: AutofillFormData = {
  fullName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  cardNumber: "",
  cardName: "",
  cardExpiry: "",
  cardCvc: "",
};

interface SettingsPageProps {
  onNavigate: (url: string) => void;
  onAliasesChanged?: (map: Record<string, string>) => void;
  onBookmarkBarChange?: (enabled: boolean) => void;
}

const NAV: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "ai", label: "Inix AI", icon: "✦" },
  { id: "tabs", label: "Tabs & memory", icon: "▣" },
  { id: "history", label: "History", icon: "◷" },
  { id: "vault", label: "Vault", icon: "⛨" },
  { id: "autofill", label: "Autofill", icon: "📋" },
  { id: "profiles", label: "Profiles", icon: "👤" },
  { id: "library", label: "Library", icon: "★" },
  { id: "routes", label: "Quick routes", icon: "↗" },
  { id: "privacy", label: "Privacy", icon: "🛡" },
  { id: "data", label: "Data", icon: "⌂" },
];

export function SettingsPage({ onNavigate, onAliasesChanged, onBookmarkBarChange }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("ai");
  const [aiProvider, setAiProvider] = useState<AiProvider>("local");
  const [host, setHost] = useState("http://127.0.0.1:11434");
  const [chatModel, setChatModel] = useState("qwen2.5:7b");
  const [embedModel, setEmbedModel] = useState("nomic-embed-text");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [apiModel, setApiModel] = useState("gpt-4o-mini");
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [captureEnabled, setCaptureEnabled] = useState(true);
  const [archiveEnabled, setArchiveEnabled] = useState(true);
  const [bookmarkBarEnabled, setBookmarkBarEnabled] = useState(false);
  const [tabFreezeEnabled, setTabFreezeEnabled] = useState(true);
  const [tabFreezeMinutes, setTabFreezeMinutes] = useState(30);
  const [historyMode, setHistoryMode] = useState<"standard" | "transient" | "vaulted">("standard");
  const [transientPurgeOnClose, setTransientPurgeOnClose] = useState(true);
  const [transientRetentionHours, setTransientRetentionHours] = useState(24);
  const [homepageUrl, setHomepageUrl] = useState("inix://newtab");
  const [newTabUseHomepage, setNewTabUseHomepage] = useState(false);
  const [privateModeShortcut, setPrivateModeShortcut] = useState<"window" | "tab">("window");
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [aliases, setAliases] = useState<UrlAlias[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [newAliasUrl, setNewAliasUrl] = useState("");
  const [newAliasTitle, setNewAliasTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const [vaultConfigured, setVaultConfigured] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultChangeOpen, setVaultChangeOpen] = useState(false);
  const [oldVaultPw, setOldVaultPw] = useState("");
  const [newVaultPw, setNewVaultPw] = useState("");
  const [savedCredentials, setSavedCredentials] = useState<StoredCredential[]>([]);
  const [autofillProfiles, setAutofillProfiles] = useState<AutofillProfileMeta[]>([]);
  const [selectedAutofillId, setSelectedAutofillId] = useState<number | null>(null);
  const [autofillForm, setAutofillForm] = useState<AutofillFormData>(EMPTY_AUTOFILL);
  const [autofillLabel, setAutofillLabel] = useState("");
  const [browserProfiles, setBrowserProfiles] = useState<BrowserProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const refreshEngineStatus = useCallback(async () => {
    setRefreshingModels(true);
    try {
      const status = await window.inix?.ai.getStatus();
      if (status) setEngineStatus(status);
    } finally {
      setRefreshingModels(false);
    }
  }, []);

  useEffect(() => {
    void window.inix?.settings.getFormatted().then((s) => {
      if (!s) return;
      setAiProvider(s.ai_provider);
      setHost(s.engine_host);
      setChatModel(s.chat_model);
      setEmbedModel(s.embed_model);
      setApiBaseUrl(s.api_base_url);
      setApiKey(s.api_key);
      setApiModel(s.api_model);
      setCaptureEnabled(s.capture_enabled);
      setArchiveEnabled(s.archive_enabled);
      setBookmarkBarEnabled(s.bookmark_bar_enabled);
      setTabFreezeEnabled(s.tab_freeze_enabled);
      setTabFreezeMinutes(s.tab_freeze_minutes);
      setHistoryMode(s.history_mode);
      setTransientPurgeOnClose(s.transient_purge_on_close);
      setTransientRetentionHours(s.transient_retention_hours);
      setHomepageUrl(s.homepage_url || "inix://newtab");
      setNewTabUseHomepage(s.new_tab_use_homepage);
      setPrivateModeShortcut(s.private_mode_shortcut);
    });
    void window.inix?.aliases.list().then(setAliases);
    void window.inix?.vault.isConfigured().then(setVaultConfigured);
    void window.inix?.update.version().then((v) => setAppVersion(v ?? ""));
    void refreshEngineStatus();
  }, [refreshEngineStatus]);

  const checkForUpdates = async () => {
    setUpdateMessage(null);
    setCheckingUpdate(true);
    const supported = await window.inix?.update.supported();
    if (!supported) {
      setUpdateMessage("Updates are checked in the installed app (.exe), not in dev mode.");
      setCheckingUpdate(false);
      return;
    }
    let sawResult = false;
    const unsubAvailable = window.inix?.update.onAvailable(() => {
      sawResult = true;
      setUpdateMessage("Update found — see the prompt in the main window.");
      setCheckingUpdate(false);
      unsubAvailable?.();
      unsubNotAvailable?.();
    });
    const unsubNotAvailable = window.inix?.update.onNotAvailable(() => {
      sawResult = true;
      setUpdateMessage(`You're up to date (v${appVersion}).`);
      setCheckingUpdate(false);
      unsubAvailable?.();
      unsubNotAvailable?.();
    });
    const result = await window.inix?.update.check();
    if (!result?.ok) {
      setUpdateMessage(result?.error ?? "Could not check for updates.");
      setCheckingUpdate(false);
      unsubAvailable?.();
      unsubNotAvailable?.();
      return;
    }
    window.setTimeout(() => {
      if (!sawResult) {
        setUpdateMessage("Still checking… If an update exists, a prompt will appear.");
        setCheckingUpdate(false);
        unsubAvailable?.();
        unsubNotAvailable?.();
      }
    }, 12_000);
  };

  const refreshVaultData = useCallback(async () => {
    const [configured, creds] = await Promise.all([
      window.inix?.vault.isConfigured(),
      window.inix?.vault.isUnlocked().then((unlocked) =>
        unlocked ? window.inix?.credentials.list() : []
      ),
    ]);
    if (configured != null) setVaultConfigured(configured);
    if (creds) setSavedCredentials(creds as StoredCredential[]);
  }, []);

  const refreshAutofill = useCallback(async () => {
    const profiles = await window.inix?.autofill.profiles();
    if (!profiles) return;
    setAutofillProfiles(profiles as AutofillProfileMeta[]);
    const activeId = selectedAutofillId ?? profiles[0]?.id ?? null;
    if (activeId != null) {
      setSelectedAutofillId(activeId);
      const data = await window.inix?.autofill.profileData(activeId);
      const meta = (profiles as AutofillProfileMeta[]).find((p) => p.id === activeId);
      if (meta) setAutofillLabel(meta.label);
      if (data) setAutofillForm({ ...EMPTY_AUTOFILL, ...(data as Partial<AutofillFormData>) });
    }
  }, [selectedAutofillId]);

  const refreshBrowserProfiles = useCallback(async () => {
    const list = await window.inix?.profiles.list();
    if (list) setBrowserProfiles(list as BrowserProfile[]);
  }, []);

  const refreshPrivacy = useCallback(async () => {
    const [siteList, grantList] = await Promise.all([
      window.inix?.siteData.list(),
      window.inix?.permission.list(),
    ]);
    if (siteList) setSites(siteList);
    if (grantList) setGrants(grantList);
  }, []);

  useEffect(() => {
    if (section === "privacy") void refreshPrivacy();
    if (section === "vault") void refreshVaultData();
    if (section === "autofill") void refreshAutofill();
    if (section === "profiles") void refreshBrowserProfiles();
  }, [section, refreshPrivacy, refreshVaultData, refreshAutofill, refreshBrowserProfiles]);

  const installed = engineStatus?.models ?? [];
  const isLocal = aiProvider === "local";
  const chatModels = useMemo(
    () => (isLocal ? chatModelsFromOllama(installed) : installed),
    [installed, isLocal]
  );
  const embedModels = useMemo(() => embedModelsFromOllama(installed), [installed]);

  const switchProvider = async (provider: AiProvider) => {
    setAiProvider(provider);
    await window.inix?.settings.set("ai_provider", provider);
    void refreshEngineStatus();
  };

  const suggestedInstalled = useMemo(() => {
    for (const rec of RECOMMENDED_CHAT_MODELS) {
      if (isModelInstalled(rec.name, installed)) return rec.name;
    }
    return chatModels[0] ?? null;
  }, [installed, chatModels]);

  const save = async () => {
    const s = window.inix?.settings;
    if (!s) return;
    await s.set("ai_provider", aiProvider);
    await s.set("engine_host", host);
    await s.set("chat_model", chatModel);
    await s.set("embed_model", embedModel);
    await s.set("api_base_url", apiBaseUrl);
    await s.set("api_key", apiKey);
    await s.set("api_model", apiModel);
    await s.set("capture_enabled", captureEnabled ? "true" : "false");
    await s.set("archive_enabled", archiveEnabled ? "true" : "false");
    await s.set("bookmark_bar_enabled", bookmarkBarEnabled ? "true" : "false");
    await s.set("tab_freeze_enabled", tabFreezeEnabled ? "true" : "false");
    await s.set("tab_freeze_minutes", String(tabFreezeMinutes));
    await s.set("history_mode", historyMode);
    await s.set("transient_purge_on_close", transientPurgeOnClose ? "true" : "false");
    await s.set("transient_retention_hours", String(transientRetentionHours));
    await s.set("homepage_url", homepageUrl.trim() || "inix://newtab");
    await s.set("new_tab_use_homepage", newTabUseHomepage ? "true" : "false");
    await s.set("private_mode_shortcut", privateModeShortcut);
    await window.inix?.chrome.setBookmarkBar(bookmarkBarEnabled);
    onBookmarkBarChange?.(bookmarkBarEnabled);
    const map = await window.inix?.aliases.map();
    if (map && onAliasesChanged) onAliasesChanged(map);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    void refreshEngineStatus();
  };

  const addAlias = async () => {
    if (!newAlias.trim() || !newAliasUrl.trim()) return;
    await window.inix?.aliases.set(newAlias.trim(), newAliasUrl.trim(), newAliasTitle.trim());
    const list = await window.inix?.aliases.list();
    const map = await window.inix?.aliases.map();
    if (list) setAliases(list);
    if (map && onAliasesChanged) onAliasesChanged(map);
    setNewAlias("");
    setNewAliasUrl("");
    setNewAliasTitle("");
  };

  const removeAliasRow = async (alias: string) => {
    await window.inix?.aliases.remove(alias);
    const list = await window.inix?.aliases.list();
    const map = await window.inix?.aliases.map();
    if (list) setAliases(list);
    if (map && onAliasesChanged) onAliasesChanged(map);
  };

  const clearHistory = async () => {
    if (confirm("Clear all Inix history, saved pages, and search index?")) {
      await window.inix?.storage.historyClear();
    }
  };

  const rebuildIndex = async () => {
    await window.inix?.settings.rebuildIndex();
    alert("Inix search index rebuild started. This runs in the background.");
  };

  const changeVaultPassword = async () => {
    const result = await window.inix?.vault.changePassword(oldVaultPw, newVaultPw);
    if (result?.ok) {
      setVaultChangeOpen(false);
      setOldVaultPw("");
      setNewVaultPw("");
      alert("Vault password updated.");
    } else {
      alert(result?.error ?? "Could not change password");
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-page-hero">
        <div className="settings-page-hero-text">
          <button type="button" className="settings-back-btn" onClick={() => onNavigate("inix://newtab")}>
            ← Back
          </button>
          <h1>
            <span className="logo-icon">◆</span> Settings
          </h1>
          <p className="settings-page-subtitle">Configure Inix AI, privacy, and browsing — everything stays local.</p>
        </div>
        <div className="settings-page-hero-actions">
          <button type="button" className="settings-save-btn" onClick={() => void save()}>
            {saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </header>

      <div className="settings-page-body">
        <nav className="settings-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item${section === item.id ? " active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              <span className="settings-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "ai" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Inix AI</h2>
                  <p>
                    {isLocal
                      ? "Run chat locally with Ollama — fully private on your machine."
                      : "Use your own OpenAI-compatible API for chat."}
                  </p>
                </div>
                <span
                  className={`settings-engine-badge${engineStatus?.connected ? " online" : " offline"}`}
                >
                  {engineStatus?.connected
                    ? isLocal
                      ? "Ollama online"
                      : "API connected"
                    : isLocal
                      ? "Ollama offline"
                      : "API not ready"}
                </span>
              </div>

              <div className="settings-provider-toggle">
                <button
                  type="button"
                  className={isLocal ? "active" : ""}
                  onClick={() => void switchProvider("local")}
                >
                  Local (Ollama)
                </button>
                <button
                  type="button"
                  className={!isLocal ? "active" : ""}
                  onClick={() => void switchProvider("api")}
                >
                  Custom API
                </button>
              </div>

              {isLocal ? (
                <>
                  <label className="settings-field">
                    <span>Ollama address</span>
                    <input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      onBlur={() => void refreshEngineStatus()}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </label>

                  {!engineStatus?.connected && (
                    <p className="settings-callout settings-callout-warn">
                      Could not reach Ollama{engineStatus?.error ? `: ${engineStatus.error}` : ""}. Make sure Ollama
                      is running, then refresh models.
                    </p>
                  )}

                  <div className="settings-subhead">
                    <h3>Suggested models</h3>
                    <p>
                      Recommended starting point: <strong>{SUGGESTED_CHAT_MODEL}</strong>
                      {suggestedInstalled && (
                        <>
                          {" "}
                          — you have <strong>{suggestedInstalled}</strong> installed
                        </>
                      )}
                    </p>
                  </div>

                  <div className="settings-model-grid">
                    {RECOMMENDED_CHAT_MODELS.map((rec) => {
                      const installedMatch = isModelInstalled(rec.name, installed);
                      const selected = chatModel === rec.name || chatModel.startsWith(`${rec.name}:`);
                      return (
                        <button
                          key={rec.name}
                          type="button"
                          className={`settings-model-card${selected ? " selected" : ""}${installedMatch ? " installed" : ""}`}
                          onClick={() => setChatModel(rec.name)}
                        >
                          <div className="settings-model-card-top">
                            <span className="settings-model-name">{rec.name}</span>
                            <span
                              className={`settings-model-badge${installedMatch ? " ready" : " missing"}`}
                            >
                              {installedMatch ? "Installed" : "Not installed"}
                            </span>
                          </div>
                          <p className="settings-model-note">{rec.note}</p>
                          {!installedMatch && (
                            <code className="settings-model-pull">ollama pull {rec.name}</code>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="settings-subhead settings-subhead-row">
                    <div>
                      <h3>Local models from Ollama</h3>
                      <p>
                        {chatModels.length > 0
                          ? `${chatModels.length} chat model${chatModels.length === 1 ? "" : "s"} found on this device`
                          : "No chat models detected — pull one with Ollama first"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-refresh-btn"
                      onClick={() => void refreshEngineStatus()}
                      disabled={refreshingModels}
                    >
                      {refreshingModels ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>

                  {chatModels.length > 0 ? (
                    <div className="settings-installed-list">
                      {chatModels.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`settings-installed-item${chatModel === name ? " selected" : ""}`}
                          onClick={() => setChatModel(name)}
                        >
                          <span>{name}</span>
                          {chatModel === name && <span className="settings-installed-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="settings-empty-models">
                      <p>Start Ollama and run:</p>
                      <code>ollama pull {SUGGESTED_CHAT_MODEL}</code>
                    </div>
                  )}

                  <label className="settings-field">
                    <span>Active chat model</span>
                    <select value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
                      {chatModels.length === 0 && <option value={chatModel}>{chatModel}</option>}
                      {chatModels.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      {!chatModels.includes(chatModel) && chatModel && (
                        <option value={chatModel}>{chatModel} (custom)</option>
                      )}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <p className="settings-callout settings-callout-info">
                    Chat goes to your API provider. Your key is stored only on this device. Inix semantic search still
                    uses local Ollama embeddings below.
                  </p>

                  <div className="settings-api-presets">
                    {API_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className="settings-api-preset"
                        onClick={() => {
                          setApiBaseUrl(preset.base);
                          setApiModel(preset.model);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <label className="settings-field">
                    <span>API base URL</span>
                    <input
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>

                  <label className="settings-field">
                    <span>API key</span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-…"
                      autoComplete="off"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Model name</span>
                    <input
                      value={apiModel}
                      onChange={(e) => setApiModel(e.target.value)}
                      placeholder="gpt-4o-mini"
                    />
                  </label>

                  <div className="settings-subhead settings-subhead-row">
                    <div>
                      <h3>Models from your API</h3>
                      <p>
                        {chatModels.length > 0
                          ? `${chatModels.length} model${chatModels.length === 1 ? "" : "s"} returned`
                          : "Save your key and refresh to list models (if your provider supports it)"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-refresh-btn"
                      onClick={() => void save().then(() => refreshEngineStatus())}
                      disabled={refreshingModels}
                    >
                      {refreshingModels ? "Refreshing…" : "Test & refresh"}
                    </button>
                  </div>

                  {!engineStatus?.connected && engineStatus?.error && (
                    <p className="settings-callout settings-callout-warn">{engineStatus.error}</p>
                  )}

                  {chatModels.length > 0 && (
                    <div className="settings-installed-list">
                      {chatModels.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`settings-installed-item${apiModel === name ? " selected" : ""}`}
                          onClick={() => setApiModel(name)}
                        >
                          <span>{name}</span>
                          {apiModel === name && <span className="settings-installed-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="settings-divider" />

              <div className="settings-subhead">
                <h3>Semantic search (local)</h3>
                <p>Embeddings always run through Ollama on your machine.</p>
              </div>

              <label className="settings-field">
                <span>Ollama address (for search embeddings)</span>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  onBlur={() => void refreshEngineStatus()}
                  placeholder="http://127.0.0.1:11434"
                />
              </label>

              <label className="settings-field">
                <span>Search / embedding model</span>
                <select value={embedModel} onChange={(e) => setEmbedModel(e.target.value)}>
                  {embedModels.length === 0 && <option value={embedModel}>{embedModel}</option>}
                  {embedModels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  {!embedModels.includes(embedModel) && embedModel && (
                    <option value={embedModel}>{embedModel} (custom)</option>
                  )}
                </select>
              </label>
              <p className="settings-note">
                Default: <code>nomic-embed-text</code> — run <code>ollama pull nomic-embed-text</code> if needed.
              </p>
            </section>
          )}

          {section === "tabs" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Tabs & memory</h2>
                  <p>Free RAM by hibernating tabs you are not using.</p>
                </div>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={tabFreezeEnabled}
                  onChange={(e) => setTabFreezeEnabled(e.target.checked)}
                />
                <span>Auto-hibernate inactive background tabs</span>
              </label>
              <label className="settings-field">
                <span>Hibernate after (minutes)</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={tabFreezeMinutes}
                  onChange={(e) => setTabFreezeMinutes(parseInt(e.target.value, 10) || 30)}
                />
              </label>
              <p className="settings-note">Hibernated tabs keep their URL and scroll position.</p>

              <div className="settings-divider" />

              <div className="settings-card-head">
                <div>
                  <h2>Homepage</h2>
                  <p>Where the Home button and Alt+Home shortcut take you.</p>
                </div>
              </div>
              <label className="settings-field">
                <span>Homepage URL</span>
                <input
                  value={homepageUrl}
                  onChange={(e) => setHomepageUrl(e.target.value)}
                  placeholder="inix://newtab or https://example.com"
                />
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={newTabUseHomepage}
                  onChange={(e) => setNewTabUseHomepage(e.target.checked)}
                />
                <span>Open homepage instead of the Inix new tab page for new tabs</span>
              </label>
              <p className="settings-note">
                Use <code>inix://newtab</code> for the default Inix start page, or any web address.
              </p>

              <div className="settings-divider" />

              <div className="settings-card-head">
                <div>
                  <h2>Private browsing</h2>
                  <p>Choose what Ctrl+Shift+N does.</p>
                </div>
              </div>
              <label className="settings-field">
                <span>Ctrl+Shift+N opens</span>
                <select
                  value={privateModeShortcut}
                  onChange={(e) => setPrivateModeShortcut(e.target.value as "window" | "tab")}
                >
                  <option value="window">New private window (all tabs private)</option>
                  <option value="tab">New private tab in this window</option>
                </select>
              </label>
            </section>
          )}

          {section === "privacy" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Site data</h2>
                  <p>Sites with stored cookies. Clear data for individual sites.</p>
                </div>
                <button type="button" className="settings-refresh-btn" onClick={() => void refreshPrivacy()}>
                  Refresh
                </button>
              </div>
              {sites.length === 0 ? (
                <p className="settings-note">No site cookies stored yet.</p>
              ) : (
                <ul className="site-data-list">
                  {sites.map((site) => (
                    <li key={`${site.partition}|${site.origin}`}>
                      <div>
                        <strong>{(() => {
                          try {
                            return new URL(site.origin).hostname;
                          } catch {
                            return site.origin;
                          }
                        })()}</strong>
                        <span className="site-data-meta">
                          {site.cookieCount} cookie{site.cookieCount === 1 ? "" : "s"} ·{" "}
                          {site.partition === "inix-private" ? "Private" : "Normal"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="settings-secondary-btn"
                        onClick={() => {
                          void window.inix?.siteData
                            .clearOrigin(site.origin, { partition: site.partition })
                            .then(() => refreshPrivacy());
                        }}
                      >
                        Clear
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="settings-divider" />

              <div className="settings-card-head">
                <div>
                  <h2>Site permissions</h2>
                  <p>Sites you allowed to use camera, mic, location, and other features.</p>
                </div>
              </div>
              {grants.length === 0 ? (
                <p className="settings-note">No remembered permissions yet.</p>
              ) : (
                <ul className="site-data-list">
                  {grants.map((grant) => (
                    <li key={`${grant.partition}|${grant.origin}|${grant.permission}`}>
                      <div>
                        <strong>{(() => {
                          try {
                            return new URL(grant.origin).hostname;
                          } catch {
                            return grant.origin;
                          }
                        })()}</strong>
                        <span className="site-data-meta">
                          {grant.permission} · {grant.partition === "inix-private" ? "Private" : "Normal"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="settings-secondary-btn"
                        onClick={() => {
                          void window.inix?.permission
                            .revoke(grant.partition, grant.origin, grant.permission)
                            .then(() => refreshPrivacy());
                        }}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {section === "history" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>History tiers</h2>
                  <p>Choose how browsing history is stored on your device.</p>
                </div>
              </div>
              <label className="settings-field">
                <span>Default history mode</span>
                <select value={historyMode} onChange={(e) => setHistoryMode(e.target.value as typeof historyMode)}>
                  <option value="standard">Standard — kept locally with full search</option>
                  <option value="transient">Transient — auto-purged after 24h</option>
                  <option value="vaulted">Vaulted — encrypted behind master password</option>
                </select>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={transientPurgeOnClose}
                  onChange={(e) => setTransientPurgeOnClose(e.target.checked)}
                />
                <span>Purge transient history when Inix closes</span>
              </label>
              <label className="settings-field">
                <span>Transient retention (hours)</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={transientRetentionHours}
                  onChange={(e) => setTransientRetentionHours(parseInt(e.target.value, 10) || 24)}
                />
              </label>
            </section>
          )}

          {section === "vault" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>History vault</h2>
                  <p>Encrypt sensitive history behind a master password.</p>
                </div>
              </div>
              {!vaultConfigured ? (
                <>
                  <p className="settings-note">
                    There is no recovery if you forget your vault password.
                  </p>
                  <button type="button" className="settings-primary-btn" onClick={() => setVaultModalOpen(true)}>
                    Set up vault password
                  </button>
                </>
              ) : (
                <>
                  <p className="settings-callout settings-callout-ok">Vault is configured on this device.</p>
                  {!vaultChangeOpen ? (
                    <button type="button" className="settings-secondary-btn" onClick={() => setVaultChangeOpen(true)}>
                      Change vault password
                    </button>
                  ) : (
                    <div className="vault-change-form">
                      <label className="settings-field">
                        <span>Current password</span>
                        <input type="password" value={oldVaultPw} onChange={(e) => setOldVaultPw(e.target.value)} />
                      </label>
                      <label className="settings-field">
                        <span>New password</span>
                        <input type="password" value={newVaultPw} onChange={(e) => setNewVaultPw(e.target.value)} />
                      </label>
                      <button type="button" className="settings-primary-btn" onClick={() => void changeVaultPassword()}>
                        Update password
                      </button>
                    </div>
                  )}
                </>
              )}
              {vaultConfigured && (
                <>
                  <h3 className="settings-subhead">Saved passwords</h3>
                  <p className="settings-note">
                    Unlock the vault to view saved logins. Passwords are encrypted locally.
                  </p>
                  {savedCredentials.length === 0 ? (
                    <p className="settings-note">No saved passwords yet.</p>
                  ) : (
                    <ul className="alias-list">
                      {savedCredentials.map((c) => (
                        <li key={c.id}>
                          <code>{(() => {
                            try {
                              return new URL(c.origin).hostname;
                            } catch {
                              return c.origin;
                            }
                          })()}</code>
                          <span>{c.username}</span>
                          <button
                            type="button"
                            className="alias-remove"
                            onClick={() =>
                              void window.inix?.credentials.remove(c.id).then(() => refreshVaultData())
                            }
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}

          {section === "autofill" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Autofill profiles</h2>
                  <p>Encrypted name, address, and payment details for checkout forms.</p>
                </div>
                <button
                  type="button"
                  className="settings-refresh-btn"
                  onClick={() => void refreshAutofill()}
                >
                  Refresh
                </button>
              </div>
              {!vaultConfigured ? (
                <p className="settings-note">Set up the vault first to store autofill profiles.</p>
              ) : (
                <>
                  <div className="alias-add-row">
                    <select
                      value={selectedAutofillId ?? ""}
                      onChange={(e) => {
                        const id = parseInt(e.target.value, 10);
                        setSelectedAutofillId(id);
                        void refreshAutofill();
                      }}
                    >
                      {autofillProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        void window.inix?.autofill.createProfile("New profile").then(() => refreshAutofill())
                      }
                    >
                      Add profile
                    </button>
                  </div>
                  {selectedAutofillId != null && (
                    <>
                      <label className="settings-field">
                        <span>Profile label</span>
                        <input
                          value={autofillLabel}
                          onChange={(e) => setAutofillLabel(e.target.value)}
                        />
                      </label>
                      {(
                        [
                          ["fullName", "Full name"],
                          ["email", "Email"],
                          ["phone", "Phone"],
                          ["addressLine1", "Address line 1"],
                          ["addressLine2", "Address line 2"],
                          ["city", "City"],
                          ["state", "State / region"],
                          ["postalCode", "Postal code"],
                          ["country", "Country"],
                          ["cardName", "Card name"],
                          ["cardNumber", "Card number"],
                          ["cardExpiry", "Expiry (MM/YY)"],
                          ["cardCvc", "CVC"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="settings-field">
                          <span>{label}</span>
                          <input
                            value={autofillForm[key]}
                            onChange={(e) =>
                              setAutofillForm((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                      <div className="settings-actions-row">
                        <button
                          type="button"
                          className="settings-primary-btn"
                          onClick={() =>
                            void window.inix?.autofill
                              .updateProfile(
                                selectedAutofillId,
                                autofillLabel,
                                autofillForm as unknown as Record<string, string>
                              )
                              .then(() => refreshAutofill())
                          }
                        >
                          Save profile
                        </button>
                        <button
                          type="button"
                          className="settings-secondary-btn"
                          onClick={() =>
                            void window.inix?.autofill.setDefault(selectedAutofillId).then(() => refreshAutofill())
                          }
                        >
                          Set as default
                        </button>
                        <button
                          type="button"
                          className="settings-secondary-btn"
                          onClick={() =>
                            void window.inix?.autofill
                              .removeProfile(selectedAutofillId)
                              .then(() => {
                                setSelectedAutofillId(null);
                                return refreshAutofill();
                              })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {section === "profiles" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Browser profiles</h2>
                  <p>Separate cookies, history, and site data per profile. Each opens in its own window.</p>
                </div>
                <button
                  type="button"
                  className="settings-refresh-btn"
                  onClick={() => void refreshBrowserProfiles()}
                >
                  Refresh
                </button>
              </div>
              <div className="alias-add-row">
                <input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="New profile name"
                />
                <button
                  type="button"
                  onClick={() =>
                    void window.inix?.profiles
                      .create(newProfileName.trim() || "Profile")
                      .then(() => {
                        setNewProfileName("");
                        return refreshBrowserProfiles();
                      })
                  }
                >
                  Create
                </button>
              </div>
              <ul className="alias-list">
                {browserProfiles.map((p) => (
                  <li key={p.id}>
                    <span
                      className="profile-color-dot"
                      style={{ background: p.color, width: 10, height: 10, borderRadius: "50%", display: "inline-block" }}
                    />
                    <span>{p.name}</span>
                    {p.id !== "default" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void window.inix?.profiles.openWindow(p.id)}
                        >
                          Open window
                        </button>
                        <button
                          type="button"
                          className="alias-remove"
                          onClick={() =>
                            void window.inix?.profiles.delete(p.id).then(() => refreshBrowserProfiles())
                          }
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className="settings-note">Default profile</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {section === "library" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Library & archives</h2>
                  <p>Control what Inix saves when you bookmark pages.</p>
                </div>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={archiveEnabled}
                  onChange={(e) => setArchiveEnabled(e.target.checked)}
                />
                <span>Save Inix Archives when bookmarking (offline snapshots)</span>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={captureEnabled}
                  onChange={(e) => setCaptureEnabled(e.target.checked)}
                />
                <span>Save page content for Inix semantic search</span>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={bookmarkBarEnabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setBookmarkBarEnabled(enabled);
                    await window.inix?.settings.set("bookmark_bar_enabled", enabled ? "true" : "false");
                    await window.inix?.chrome.setBookmarkBar(enabled);
                    onBookmarkBarChange?.(enabled);
                  }}
                />
                <span>Show classic bookmarks bar (Chrome/Firefox-style strip under the toolbar)</span>
              </label>
              <p className="settings-note">
                New bookmarks are added to the bar when this is on. Right-click a bar item to remove it.
              </p>
              <p className="settings-note">Everything stays on your machine — nothing is sent to the cloud.</p>
            </section>
          )}

          {section === "routes" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Quick routes</h2>
                  <p>Type an alias in the address bar to jump directly — e.g. gh, localai</p>
                </div>
              </div>
              <div className="alias-add-row">
                <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="Alias" />
                <input value={newAliasUrl} onChange={(e) => setNewAliasUrl(e.target.value)} placeholder="Target URL" />
                <input
                  value={newAliasTitle}
                  onChange={(e) => setNewAliasTitle(e.target.value)}
                  placeholder="Label (optional)"
                />
                <button type="button" onClick={() => void addAlias()}>
                  Add
                </button>
              </div>
              <ul className="alias-list">
                {aliases.map((a) => (
                  <li key={a.alias}>
                    <code>{a.alias}</code>
                    <span>{a.title || a.url}</span>
                    <button type="button" className="alias-remove" onClick={() => void removeAliasRow(a.alias)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {section === "data" && (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>Updates</h2>
                  <p>Installed builds check GitHub Releases for new versions automatically.</p>
                </div>
              </div>
              <p className="settings-note">
                Current version: <strong>{appVersion || "…"}</strong>
              </p>
              <div className="settings-action-row">
                <button
                  type="button"
                  className="settings-secondary-btn"
                  disabled={checkingUpdate}
                  onClick={() => void checkForUpdates()}
                >
                  {checkingUpdate ? "Checking…" : "Check for updates"}
                </button>
              </div>
              {updateMessage && <p className="settings-callout">{updateMessage}</p>}
              <div className="settings-card-head" style={{ marginTop: 24 }}>
                <div>
                  <h2>Data & search</h2>
                  <p>Manage local history, site data, and rebuild the search index.</p>
                </div>
              </div>
              <div className="settings-action-row">
                <button type="button" className="settings-secondary-btn" onClick={rebuildIndex}>
                  Rebuild search index
                </button>
                <button type="button" className="settings-danger-btn" onClick={() => void clearHistory()}>
                  Clear all history
                </button>
              </div>
              <div className="settings-card-head" style={{ marginTop: 24 }}>
                <div>
                  <h2>Site data</h2>
                  <p>Clear cookies, cache, and site storage from browsing sessions.</p>
                </div>
              </div>
              <div className="settings-action-row">
                <button
                  type="button"
                  className="settings-secondary-btn"
                  onClick={() => {
                    void window.inix?.siteData.clear({ cache: true }).then(() => {
                      setSaved(true);
                      setTimeout(() => setSaved(false), 2000);
                    });
                  }}
                >
                  Clear cache
                </button>
                <button
                  type="button"
                  className="settings-secondary-btn"
                  onClick={() => {
                    void window.inix?.siteData.clear({ cookies: true, storage: true }).then(() => {
                      setSaved(true);
                      setTimeout(() => setSaved(false), 2000);
                    });
                  }}
                >
                  Clear cookies & storage
                </button>
                <button
                  type="button"
                  className="settings-danger-btn"
                  onClick={() => {
                    void window.inix?.siteData
                      .clear({ cookies: true, cache: true, storage: true, privateOnly: false })
                      .then(() => {
                        setSaved(true);
                        setTimeout(() => setSaved(false), 2000);
                      });
                  }}
                >
                  Clear all site data
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      <VaultUnlockModal
        open={vaultModalOpen}
        setupMode
        onClose={() => setVaultModalOpen(false)}
        onUnlocked={() => {
          setVaultConfigured(true);
          void refreshVaultData();
        }}
      />
    </div>
  );
}
