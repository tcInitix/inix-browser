import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngineStatus, UrlAlias, SiteRecord, PermissionGrant, ImportResult } from "../inix.d";
import { RECOMMENDED_CHAT_MODELS, SUGGESTED_CHAT_MODEL } from "../constants/recommended-models";
import {
  chatModelsFromOllama,
  embedModelsFromOllama,
  isModelInstalled,
} from "../utils/ollama-models";
import { VaultUnlockModal } from "./VaultUnlockModal";
import { Switch } from "./Switch";
import { serializePanicUrls, normalizePanicUrls } from "../utils/panic";
import { friendlyUpdateError } from "../utils/update-text";
import type { InixSettings } from "../inix.d";
import {
  AppearanceSettingsSection,
  BrowsingSettingsSection,
  DownloadsSettingsSection,
  GeneralSettingsSection,
  NewTabSettingsSection,
  PrivacySecuritySettingsSection,
  defaultStandardSettings,
  loadStandardSettingsFromFormatted,
  saveStandardSettings,
  type StandardSettingsState,
} from "./settings/StandardSettingsSections";
import { RegionRelaySettingsSection } from "./settings/RegionRelaySettingsSection";

type AiProvider = "local" | "api";

const API_PRESETS = [
  { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "anthropic/claude-3.5-sonnet" },
  { label: "Groq", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Together", base: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
] as const;

type SettingsSection =
  | "general"
  | "appearance"
  | "privacy"
  | "downloads"
  | "ai"
  | "tabs"
  | "history"
  | "newtab"
  | "vault"
  | "autofill"
  | "profiles"
  | "library"
  | "routes"
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

interface ChromeProfileOption {
  id: string;
  name: string;
  dir: string;
}

function formatImportResult(label: string, result: ImportResult): string {
  if (result.canceled) return "";
  if (!result.ok) return result.error ?? `${label} import failed.`;
  const parts: string[] = [];
  if (result.imported) parts.push(`${result.imported} new`);
  if (result.updated) parts.push(`${result.updated} updated`);
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  if (result.failed) parts.push(`${result.failed} failed`);
  if (parts.length) {
    const fromFile = result.parsed != null ? ` (${result.parsed} found in file)` : "";
    return `${label}: ${parts.join(", ")}${fromFile}.`;
  }
  if (result.parsed) {
    return `${label}: all ${result.parsed} bookmarks were already in your library.`;
  }
  return `${label}: nothing new to import.`;
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
  onRestoreTabsChange?: (enabled: boolean) => void;
  onSettingsApplied?: (settings: InixSettings) => void;
  onFactoryReset?: () => void;
}

const NAV: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "⚙" },
  { id: "appearance", label: "Appearance", icon: "◐" },
  { id: "privacy", label: "Privacy & Security", icon: "◈" },
  { id: "downloads", label: "Downloads", icon: "↓" },
  { id: "tabs", label: "Tabs & Memory", icon: "▣" },
  { id: "history", label: "History", icon: "◷" },
  { id: "newtab", label: "New Tab", icon: "⌂" },
  { id: "vault", label: "Vault", icon: "⛨" },
  { id: "autofill", label: "Autofill", icon: "▤" },
  { id: "profiles", label: "Profiles", icon: "◉" },
  { id: "library", label: "Library", icon: "★" },
  { id: "routes", label: "Quick Routes", icon: "↗" },
  { id: "ai", label: "Inix AI", icon: "✦" },
  { id: "data", label: "Data & Import", icon: "⌂" },
];

export function SettingsPage({
  onNavigate,
  onAliasesChanged,
  onBookmarkBarChange,
  onRestoreTabsChange,
  onSettingsApplied,
  onFactoryReset,
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("general");
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
  const [panicUrlsText, setPanicUrlsText] = useState("");
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [aliases, setAliases] = useState<UrlAlias[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [newAliasUrl, setNewAliasUrl] = useState("");
  const [newAliasTitle, setNewAliasTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const [vaultConfigured, setVaultConfigured] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultUnlockOpen, setVaultUnlockOpen] = useState(false);
  const pendingAutofillAdd = useRef(false);
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
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfileOption[]>([]);
  const [chromeProfileDir, setChromeProfileDir] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importingBookmarks, setImportingBookmarks] = useState(false);
  const [importingPasswords, setImportingPasswords] = useState(false);
  const [standard, setStandard] = useState<StandardSettingsState>(defaultStandardSettings);
  const [defaultDownloadPath, setDefaultDownloadPath] = useState("");

  const patchStandard = (patch: Partial<StandardSettingsState>) => {
    setStandard((prev) => ({ ...prev, ...patch }));
  };

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
      setPanicUrlsText((s.panic_urls ?? []).join("\n"));
      setStandard(loadStandardSettingsFromFormatted(s));
    });
    void window.inix?.settings.defaultDownloadPath().then((path) => {
      if (path) setDefaultDownloadPath(path);
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
      setUpdateMessage(friendlyUpdateError(result?.error ?? "Could not check for updates."));
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
      window.inix?.vault.isUnlocked().then((isUnlocked) =>
        isUnlocked ? window.inix?.credentials.list() : []
      ),
    ]);
    if (configured != null) setVaultConfigured(configured);
    if (creds) setSavedCredentials(creds as StoredCredential[]);
  }, []);

  const refreshAutofill = useCallback(async () => {
    const unlocked = await window.inix?.vault.isUnlocked();
    setVaultUnlocked(!!unlocked);
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
    } else {
      setAutofillLabel("");
      setAutofillForm(EMPTY_AUTOFILL);
    }
  }, [selectedAutofillId]);

  const createAutofillProfile = useCallback(async () => {
    const unlocked = await window.inix?.vault.isUnlocked();
    if (!unlocked) {
      pendingAutofillAdd.current = true;
      setVaultUnlockOpen(true);
      return;
    }
    const result = await window.inix?.autofill.createProfile("New profile");
    if (result?.ok && result.profile) {
      setSelectedAutofillId(result.profile.id);
      await refreshAutofill();
      return;
    }
    alert(result?.error ?? "Could not create autofill profile. Unlock the vault and try again.");
  }, [refreshAutofill]);

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

  useEffect(() => {
    if (section !== "data" && section !== "vault" && section !== "library") return;
    void window.inix?.import.chromeProfiles().then((res) => {
      if (!res) return;
      setChromeProfiles(res.profiles);
      setChromeProfileDir((prev) => prev || res.profiles[0]?.dir || "");
    });
  }, [section]);

  const importChromeBookmarks = async () => {
    setImportMessage(null);
    setImportingBookmarks(true);
    try {
      const result = await window.inix?.import.pickChromeBookmarks();
      if (!result || result.canceled) return;
      setImportMessage(formatImportResult("Bookmarks", result));
    } finally {
      setImportingBookmarks(false);
    }
  };

  const importChromePasswords = async (pickCsv = false) => {
    setImportMessage(null);
    const unlocked = await window.inix?.vault.isUnlocked();
    if (!unlocked) {
      setImportMessage("Unlock the vault before importing passwords.");
      setVaultModalOpen(true);
      return;
    }
    if (!vaultConfigured) {
      setImportMessage("Set up the vault before importing passwords.");
      setVaultModalOpen(true);
      return;
    }
    setImportingPasswords(true);
    try {
      const result = pickCsv
        ? await window.inix?.import.pickChromePasswordsCsv()
        : await window.inix?.import.chromePasswords(chromeProfileDir || undefined);
      if (!result || result.canceled) return;
      setImportMessage(formatImportResult("Passwords", result));
      await refreshVaultData();
    } finally {
      setImportingPasswords(false);
    }
  };

  const chromeProfileSelect =
    chromeProfiles.length > 0 ? (
      <label className="settings-field">
        <span>Chrome profile</span>
        <select value={chromeProfileDir} onChange={(e) => setChromeProfileDir(e.target.value)}>
          {chromeProfiles.map((p) => (
            <option key={p.id} value={p.dir}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <p className="settings-note">
        Chrome was not detected. You can still choose a bookmarks HTML export or password CSV file manually.
      </p>
    );

  const chromeBookmarkImportBlock = (
    <div className="settings-import-block">
      <p className="settings-subhead-inline">Import bookmarks from Chrome</p>
      <ol className="settings-import-steps">
        <li>
          In Chrome, open <strong>Bookmark Manager</strong>{" "}
          (<code>chrome://bookmarks</code> or press Ctrl+Shift+O).
        </li>
        <li>
          Click the <strong>⋮</strong> menu (top right) → <strong>Export bookmarks</strong>.
        </li>
        <li>
          Save the <strong>.html</strong> file (usually to Downloads), then click the button below
          and choose that file.
        </li>
      </ol>
      <div className="settings-action-row">
        <button
          type="button"
          className="settings-primary-btn"
          disabled={importingBookmarks}
          onClick={() => void importChromeBookmarks()}
        >
          {importingBookmarks ? "Importing…" : "Choose bookmarks file…"}
        </button>
      </div>
      <p className="settings-note">
        Chrome saves an HTML file — that is the one to pick. Bookmarks from Chrome&apos;s bar are
        added to Inix&apos;s bar. Firefox and Edge HTML exports work too.
      </p>
    </div>
  );

  const chromePasswordImportBlock = (
    <div className="settings-import-block">
      <p className="settings-subhead-inline">Import from Chrome</p>
      {chromeProfileSelect}
      <div className="settings-action-row">
        <button
          type="button"
          className="settings-secondary-btn"
          disabled={importingPasswords || (!chromeProfileDir && chromeProfiles.length > 0)}
          onClick={() => void importChromePasswords(false)}
        >
          {importingPasswords ? "Importing…" : "Import passwords from Chrome"}
        </button>
        <button
          type="button"
          className="settings-secondary-btn"
          disabled={importingPasswords}
          onClick={() => void importChromePasswords(true)}
        >
          Choose password CSV…
        </button>
      </div>
      <p className="settings-note">
        Passwords import directly from Chrome on Windows, or from a CSV export (Chrome → Password
        Manager → Export). Unlock the vault first.
      </p>
    </div>
  );

  const chromeImportControls = (
    <>
      {chromePasswordImportBlock}
      {importMessage && <p className="settings-callout">{importMessage}</p>}
    </>
  );

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
    await saveStandardSettings(standard, s);
    const panicUrls = panicUrlsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await s.set("panic_urls", serializePanicUrls(panicUrls));
    await s.set("panic_configured", panicUrls.length > 0 ? "true" : "false");
    const normalizedPanic = normalizePanicUrls(panicUrls);
    if (normalizedPanic.length > 0) {
      await window.inix?.browser.panicSync(normalizedPanic);
    }
    await window.inix?.chrome.setBookmarkBar(bookmarkBarEnabled);
    onBookmarkBarChange?.(bookmarkBarEnabled);
    onRestoreTabsChange?.(standard.startupMode === "restore");
    const formatted = await window.inix?.settings.getFormatted();
    if (formatted) onSettingsApplied?.(formatted);
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

  const clearAllBookmarks = async () => {
    if (
      confirm(
        "Remove all bookmarks from your library and bookmarks bar? Workspace pins are cleared too. This cannot be undone."
      )
    ) {
      await window.inix?.bookmarks.clearAll();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const factoryReset = async () => {
    if (
      !confirm(
        "Reset Inix to a fresh start?\n\nThis deletes:\n• All bookmarks and library data\n• All browsing history\n• Vault passwords and saved logins\n• Extra browser profiles (default profile kept, emptied)\n• Cookies, cache, and site data\n• Quick routes and workspaces\n\nYou will go through setup again. Close other Inix windows first."
      )
    ) {
      return;
    }
    await window.inix?.app.factoryReset();
    onFactoryReset?.();
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

  const activeNav = NAV.find((item) => item.id === section);

  return (
    <div className="settings-page inix-page">
      <aside className="settings-sidebar">
        <button type="button" className="settings-back-btn" onClick={() => onNavigate("inix://newtab")}>
          ← Back
        </button>
        <h1 className="settings-sidebar-title">Settings</h1>
        <nav className="settings-nav" aria-label="Settings sections">
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
      </aside>

      <div className="settings-main">
        <header className="settings-topbar">
          <div className="settings-topbar-title">
            <h2>{activeNav?.label ?? "Settings"}</h2>
          </div>
          <button type="button" className="inix-btn-primary" onClick={() => void save()}>
            {saved ? "Saved!" : "Save changes"}
          </button>
        </header>

        <main className="settings-content">
          {section === "general" && (
            <>
              <GeneralSettingsSection state={standard} patch={patchStandard} />
              <section className="settings-card">
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
                <Switch
                  className="settings-toggle"
                  checked={newTabUseHomepage}
                  onChange={setNewTabUseHomepage}
                  label="Open homepage instead of the Inix new tab page for new tabs"
                />
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
            </>
          )}

          {section === "appearance" && (
            <AppearanceSettingsSection
              state={standard}
              patch={patchStandard}
              bookmarkBarEnabled={bookmarkBarEnabled}
              onBookmarkBarChange={(enabled) => {
                setBookmarkBarEnabled(enabled);
                onBookmarkBarChange?.(enabled);
              }}
            />
          )}

          {section === "downloads" && (
            <DownloadsSettingsSection
              state={standard}
              patch={patchStandard}
              defaultDownloadPath={defaultDownloadPath}
            />
          )}

          {section === "newtab" && <NewTabSettingsSection state={standard} patch={patchStandard} />}

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
              <Switch
                className="settings-toggle"
                checked={tabFreezeEnabled}
                onChange={setTabFreezeEnabled}
                label="Auto-hibernate inactive background tabs"
              />
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

              <BrowsingSettingsSection state={standard} patch={patchStandard} variant="section" />

              <div className="settings-divider" />

              <div className="settings-card-head">
                <div>
                  <h2>Panic switch</h2>
                  <p>
                    Instantly swap to safe tabs, then swap back. Button in the title bar or Ctrl+Shift+P.
                  </p>
                </div>
              </div>
              <label className="settings-field settings-field-stack">
                <span>Safe URLs (one per line, each opens in its own tab)</span>
                <textarea
                  className="panic-settings-textarea"
                  rows={4}
                  value={panicUrlsText}
                  onChange={(e) => setPanicUrlsText(e.target.value)}
                  placeholder={"google.com\nhttps://github.com"}
                />
              </label>
              <p className="settings-note">
                Your real tabs are preserved in memory until you switch back. Session restore keeps your real tabs,
                not the safe ones.
              </p>
            </section>
          )}

          {section === "privacy" && (
            <>
              <RegionRelaySettingsSection />
              <PrivacySecuritySettingsSection state={standard} patch={patchStandard} />
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
            </>
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
              <Switch
                className="settings-toggle"
                checked={transientPurgeOnClose}
                onChange={setTransientPurgeOnClose}
                label="Purge transient history when Inix closes"
              />
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
                  {chromePasswordImportBlock}
                  {importMessage && <p className="settings-callout">{importMessage}</p>}
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
              ) : !vaultUnlocked ? (
                <>
                  <p className="settings-note">
                    Unlock the vault to add or edit encrypted autofill profiles.
                  </p>
                  <button
                    type="button"
                    className="settings-primary-btn"
                    onClick={() => setVaultUnlockOpen(true)}
                  >
                    Unlock vault
                  </button>
                </>
              ) : (
                <>
                  <div className="settings-inline-toolbar">
                    <select
                      className="settings-select"
                      value={selectedAutofillId ?? ""}
                      onChange={(e) => {
                        const id = parseInt(e.target.value, 10);
                        setSelectedAutofillId(Number.isFinite(id) ? id : null);
                        void refreshAutofill();
                      }}
                    >
                      {autofillProfiles.length === 0 && (
                        <option value="" disabled>
                          No profiles yet
                        </option>
                      )}
                      {autofillProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="settings-primary-btn"
                      onClick={() => void createAutofillProfile()}
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
                      <div className="settings-form-grid">
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
                      </div>
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
              <div className="settings-inline-toolbar">
                <input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="New profile name"
                />
                <button
                  type="button"
                  className="settings-primary-btn"
                  onClick={() =>
                    void window.inix?.profiles
                      .create(newProfileName.trim() || "Profile")
                      .then(() => {
                        setNewProfileName("");
                        return refreshBrowserProfiles();
                      })
                  }
                >
                  Create profile
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
                          onClick={() => {
                            if (
                              !confirm(
                                `Delete profile "${p.name}"? Its cookies, cache, and site data on this device will be erased.`
                              )
                            ) {
                              return;
                            }
                            void window.inix?.profiles.delete(p.id).then(() => refreshBrowserProfiles());
                          }}
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
              <div className="settings-card-head" style={{ marginTop: 24 }}>
                <div>
                  <h2>Start over</h2>
                  <p>
                    Delete all extra profiles, wipe local data, and run first-time setup again. The default
                    profile is kept but emptied.
                  </p>
                </div>
              </div>
              <button type="button" className="settings-danger-btn" onClick={() => void factoryReset()}>
                Reset Inix &amp; run setup again
              </button>
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
              {chromeBookmarkImportBlock}
              {importMessage && <p className="settings-callout">{importMessage}</p>}
              <div className="settings-divider" />
              <div className="settings-switch-group">
                <Switch
                  className="settings-toggle"
                  checked={archiveEnabled}
                  onChange={setArchiveEnabled}
                  label="Save Inix Archives when bookmarking (offline snapshots)"
                />
                <Switch
                  className="settings-toggle"
                  checked={captureEnabled}
                  onChange={setCaptureEnabled}
                  label="Save page content for Inix semantic search"
                />
              </div>
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
                  <h2>Import from Chrome</h2>
                  <p>Import saved passwords from Chrome. Bookmarks are imported via an exported file — see Library.</p>
                </div>
              </div>
              {chromeImportControls}
              <div className="settings-card-head" style={{ marginTop: 24 }}>
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
                <button type="button" className="settings-danger-btn" onClick={() => void clearAllBookmarks()}>
                  Clear all bookmarks
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
          </main>
      </div>

      <VaultUnlockModal
        open={vaultModalOpen}
        setupMode
        onClose={() => setVaultModalOpen(false)}
        onUnlocked={() => {
          setVaultConfigured(true);
          setVaultUnlocked(true);
          void refreshVaultData();
        }}
      />
      <VaultUnlockModal
        open={vaultUnlockOpen}
        onClose={() => {
          pendingAutofillAdd.current = false;
          setVaultUnlockOpen(false);
        }}
        onUnlocked={() => {
          setVaultUnlocked(true);
          setVaultUnlockOpen(false);
          void refreshVaultData();
          void refreshAutofill();
          if (pendingAutofillAdd.current) {
            pendingAutofillAdd.current = false;
            void createAutofillProfile();
          }
        }}
      />
    </div>
  );
}
