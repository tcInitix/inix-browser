import { Switch } from "../Switch";
import { SEARCH_ENGINES, type SearchEngineId } from "../../constants/search-engines";
import type {
  InixSettings,
  PermissionDefault,
  StartupMode,
  ThemeMode,
  UiFontScale,
} from "../../inix.d";
import { applyFontScale, applyThemeMode } from "../../utils/apply-appearance";
import {
  DEFAULT_QUICK_LINKS,
  parseQuickLinks,
  serializeQuickLinks,
  type QuickLink,
} from "../../constants/quick-links";

export interface StandardSettingsState {
  startupMode: StartupMode;
  startupUrlsText: string;
  defaultSearchEngine: SearchEngineId;
  customSearchUrl: string;
  themeMode: ThemeMode;
  defaultZoomLevel: number;
  uiFontScale: UiFontScale;
  trackerBlockingEnabled: boolean;
  httpsOnlyMode: boolean;
  blockThirdPartyCookies: boolean;
  clearCookiesOnExit: boolean;
  clearCacheOnExit: boolean;
  offerSavePasswords: boolean;
  autofillEnabled: boolean;
  defaultNotifications: PermissionDefault;
  defaultGeolocation: PermissionDefault;
  defaultMedia: PermissionDefault;
  downloadPath: string;
  promptForDownload: boolean;
  closeWindowWithLastTab: boolean;
  openLinksInNewTab: boolean;
  newTabShowSearch: boolean;
  newTabShowQuickLinks: boolean;
  quickLinks: QuickLink[];
}

export function defaultStandardSettings(): StandardSettingsState {
  return {
    startupMode: "restore",
    startupUrlsText: "",
    defaultSearchEngine: "duckduckgo",
    customSearchUrl: "",
    themeMode: "dark",
    defaultZoomLevel: 0,
    uiFontScale: "medium",
    trackerBlockingEnabled: true,
    httpsOnlyMode: false,
    blockThirdPartyCookies: false,
    clearCookiesOnExit: false,
    clearCacheOnExit: false,
    offerSavePasswords: true,
    autofillEnabled: true,
    defaultNotifications: "ask",
    defaultGeolocation: "ask",
    defaultMedia: "ask",
    downloadPath: "",
    promptForDownload: false,
    closeWindowWithLastTab: false,
    openLinksInNewTab: false,
    newTabShowSearch: true,
    newTabShowQuickLinks: true,
    quickLinks: DEFAULT_QUICK_LINKS,
  };
}

export function loadStandardSettingsFromFormatted(s: InixSettings): StandardSettingsState {
  return {
    startupMode: s.startup_mode,
    startupUrlsText: (s.startup_urls ?? []).join("\n"),
    defaultSearchEngine: s.default_search_engine,
    customSearchUrl: s.custom_search_url,
    themeMode: s.theme_mode,
    defaultZoomLevel: s.default_zoom_level,
    uiFontScale: s.ui_font_scale,
    trackerBlockingEnabled: s.tracker_blocking_enabled,
    httpsOnlyMode: s.https_only_mode,
    blockThirdPartyCookies: s.block_third_party_cookies,
    clearCookiesOnExit: s.clear_cookies_on_exit,
    clearCacheOnExit: s.clear_cache_on_exit,
    offerSavePasswords: s.offer_save_passwords,
    autofillEnabled: s.autofill_enabled,
    defaultNotifications: s.default_notifications,
    defaultGeolocation: s.default_geolocation,
    defaultMedia: s.default_media,
    downloadPath: s.download_path,
    promptForDownload: s.prompt_for_download,
    closeWindowWithLastTab: s.close_window_with_last_tab,
    openLinksInNewTab: s.open_links_in_new_tab,
    newTabShowSearch: s.new_tab_show_search,
    newTabShowQuickLinks: s.new_tab_show_quick_links,
    quickLinks: parseQuickLinks(JSON.stringify(s.new_tab_quick_links)),
  };
}

export async function saveStandardSettings(
  s: StandardSettingsState,
  settingsApi: NonNullable<typeof window.inix>["settings"]
): Promise<void> {
  await settingsApi.set("startup_mode", s.startupMode);
  await settingsApi.set("restore_tabs_on_launch", s.startupMode === "restore" ? "true" : "false");
  const startupUrls = s.startupUrlsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  await settingsApi.set("startup_urls", JSON.stringify(startupUrls));
  await settingsApi.set("default_search_engine", s.defaultSearchEngine);
  await settingsApi.set("custom_search_url", s.customSearchUrl.trim());
  await settingsApi.set("theme_mode", s.themeMode);
  await settingsApi.set("default_zoom_level", String(s.defaultZoomLevel));
  await settingsApi.set("ui_font_scale", s.uiFontScale);
  await settingsApi.set("tracker_blocking_enabled", s.trackerBlockingEnabled ? "true" : "false");
  await settingsApi.set("https_only_mode", s.httpsOnlyMode ? "true" : "false");
  await settingsApi.set("block_third_party_cookies", s.blockThirdPartyCookies ? "true" : "false");
  await settingsApi.set("clear_cookies_on_exit", s.clearCookiesOnExit ? "true" : "false");
  await settingsApi.set("clear_cache_on_exit", s.clearCacheOnExit ? "true" : "false");
  await settingsApi.set("offer_save_passwords", s.offerSavePasswords ? "true" : "false");
  await settingsApi.set("autofill_enabled", s.autofillEnabled ? "true" : "false");
  await settingsApi.set("default_notifications", s.defaultNotifications);
  await settingsApi.set("default_geolocation", s.defaultGeolocation);
  await settingsApi.set("default_media", s.defaultMedia);
  await settingsApi.set("download_path", s.downloadPath.trim());
  await settingsApi.set("prompt_for_download", s.promptForDownload ? "true" : "false");
  await settingsApi.set("close_window_with_last_tab", s.closeWindowWithLastTab ? "true" : "false");
  await settingsApi.set("open_links_in_new_tab", s.openLinksInNewTab ? "true" : "false");
  await settingsApi.set("new_tab_show_search", s.newTabShowSearch ? "true" : "false");
  await settingsApi.set("new_tab_show_quick_links", s.newTabShowQuickLinks ? "true" : "false");
  await settingsApi.set("new_tab_quick_links", JSON.stringify(serializeQuickLinks(s.quickLinks)));
}

type Patch = Partial<StandardSettingsState>;

interface SectionProps {
  state: StandardSettingsState;
  patch: (p: Patch) => void;
  defaultDownloadPath?: string;
}

function permissionSelect(
  label: string,
  value: PermissionDefault,
  onChange: (v: PermissionDefault) => void
) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as PermissionDefault)}>
        <option value="ask">Ask before allowing</option>
        <option value="allow">Allow</option>
        <option value="block">Block</option>
      </select>
    </label>
  );
}

export function GeneralSettingsSection({ state, patch }: SectionProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2>On startup</h2>
          <p>Choose what opens when you launch Inix.</p>
        </div>
      </div>
      <label className="settings-field">
        <span>Startup behavior</span>
        <select
          value={state.startupMode}
          onChange={(e) => patch({ startupMode: e.target.value as StartupMode })}
        >
          <option value="restore">Continue where you left off</option>
          <option value="new_tab">Open the new tab page</option>
          <option value="homepage">Open your homepage</option>
          <option value="urls">Open specific pages</option>
        </select>
      </label>
      {state.startupMode === "urls" && (
        <label className="settings-field settings-field-stack">
          <span>Pages to open (one URL per line)</span>
          <textarea
            className="panic-settings-textarea"
            rows={4}
            value={state.startupUrlsText}
            onChange={(e) => patch({ startupUrlsText: e.target.value })}
            placeholder={"https://example.com\nhttps://news.ycombinator.com"}
          />
        </label>
      )}

      <div className="settings-divider" />

      <div className="settings-card-head">
        <div>
          <h2>Search engine</h2>
          <p>Used when you type a query in the address bar.</p>
        </div>
      </div>
      <label className="settings-field">
        <span>Default search engine</span>
        <select
          value={state.defaultSearchEngine}
          onChange={(e) => patch({ defaultSearchEngine: e.target.value as SearchEngineId })}
        >
          {SEARCH_ENGINES.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.label}
            </option>
          ))}
        </select>
      </label>
      {state.defaultSearchEngine === "custom" && (
        <label className="settings-field">
          <span>Custom search URL (use %s for the query)</span>
          <input
            value={state.customSearchUrl}
            onChange={(e) => patch({ customSearchUrl: e.target.value })}
            placeholder="https://example.com/search?q=%s"
          />
        </label>
      )}
    </section>
  );
}

export function AppearanceSettingsSection({
  state,
  patch,
  bookmarkBarEnabled,
  onBookmarkBarChange,
}: SectionProps & {
  bookmarkBarEnabled: boolean;
  onBookmarkBarChange: (enabled: boolean) => void;
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2>Theme</h2>
          <p>Customize how Inix looks on your device.</p>
        </div>
      </div>
      <label className="settings-field">
        <span>Color scheme</span>
        <select
          value={state.themeMode}
          onChange={(e) => {
            const mode = e.target.value as ThemeMode;
            patch({ themeMode: mode });
            applyThemeMode(mode);
          }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">Match system</option>
        </select>
      </label>
      <label className="settings-field">
        <span>Interface text size</span>
        <select
          value={state.uiFontScale}
          onChange={(e) => {
            const scale = e.target.value as UiFontScale;
            patch({ uiFontScale: scale });
            applyFontScale(scale);
          }}
        >
          <option value="small">Small</option>
          <option value="medium">Medium (default)</option>
          <option value="large">Large</option>
        </select>
      </label>
      <label className="settings-field">
        <span>Default page zoom</span>
        <select
          value={state.defaultZoomLevel}
          onChange={(e) => patch({ defaultZoomLevel: parseInt(e.target.value, 10) || 0 })}
        >
          <option value={-2}>75%</option>
          <option value={-1}>90%</option>
          <option value={0}>100%</option>
          <option value={1}>110%</option>
          <option value={2}>125%</option>
        </select>
      </label>

      <div className="settings-divider" />

      <Switch
        className="settings-toggle"
        checked={bookmarkBarEnabled}
        onChange={(enabled) => {
          onBookmarkBarChange(enabled);
          void window.inix?.settings.set("bookmark_bar_enabled", enabled ? "true" : "false");
          void window.inix?.chrome.setBookmarkBar(enabled);
        }}
        label="Show bookmarks bar"
      />
      <p className="settings-note">Display the bookmarks bar below the toolbar, like Chrome.</p>
    </section>
  );
}

export function PrivacySecuritySettingsSection({ state, patch }: SectionProps) {
  return (
    <>
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Privacy</h2>
            <p>Control tracking, encryption, and data retention.</p>
          </div>
        </div>
        <Switch
          className="settings-toggle"
          checked={state.trackerBlockingEnabled}
          onChange={(v) => patch({ trackerBlockingEnabled: v })}
          label="Block known trackers and ad scripts"
        />
        <Switch
          className="settings-toggle"
          checked={state.httpsOnlyMode}
          onChange={(v) => patch({ httpsOnlyMode: v })}
          label="Always use secure connections (HTTPS)"
        />
        <Switch
          className="settings-toggle"
          checked={state.blockThirdPartyCookies}
          onChange={(v) => patch({ blockThirdPartyCookies: v })}
          label="Block third-party cookies (best-effort)"
        />
        <p className="settings-note">
          Third-party cookie blocking is applied where Electron supports it. Tracker blocking remains
          the primary protection.
        </p>

        <div className="settings-divider" />

        <div className="settings-card-head">
          <div>
            <h2>On exit</h2>
            <p>Automatically clear browsing data when you quit Inix.</p>
          </div>
        </div>
        <Switch
          className="settings-toggle"
          checked={state.clearCookiesOnExit}
          onChange={(v) => patch({ clearCookiesOnExit: v })}
          label="Clear cookies and site storage on exit"
        />
        <Switch
          className="settings-toggle"
          checked={state.clearCacheOnExit}
          onChange={(v) => patch({ clearCacheOnExit: v })}
          label="Clear cached images and files on exit"
        />

        <div className="settings-divider" />

        <div className="settings-card-head">
          <div>
            <h2>Site permissions defaults</h2>
            <p>Default behavior before a site asks for access.</p>
          </div>
        </div>
        {permissionSelect("Notifications", state.defaultNotifications, (v) =>
          patch({ defaultNotifications: v })
        )}
        {permissionSelect("Location", state.defaultGeolocation, (v) =>
          patch({ defaultGeolocation: v })
        )}
        {permissionSelect("Camera & microphone", state.defaultMedia, (v) =>
          patch({ defaultMedia: v })
        )}
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Passwords</h2>
            <p>Control password saving prompts.</p>
          </div>
        </div>
        <Switch
          className="settings-toggle"
          checked={state.offerSavePasswords}
          onChange={(v) => patch({ offerSavePasswords: v })}
          label="Offer to save passwords"
        />
        <Switch
          className="settings-toggle"
          checked={state.autofillEnabled}
          onChange={(v) => patch({ autofillEnabled: v })}
          label="Enable autofill on web forms"
        />
        <p className="settings-note">
          Saved passwords and autofill profiles are encrypted in your local vault.
        </p>
      </section>
    </>
  );
}

export function DownloadsSettingsSection({ state, patch, defaultDownloadPath }: SectionProps) {
  const displayPath = state.downloadPath.trim() || defaultDownloadPath || "Downloads/Inix";

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2>Downloads</h2>
          <p>Choose where files are saved.</p>
        </div>
      </div>
      <label className="settings-field">
        <span>Download location</span>
        <div className="settings-action-row">
          <input value={displayPath} readOnly />
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={() => {
              void window.inix?.settings.pickDownloadFolder().then((picked) => {
                if (picked) patch({ downloadPath: picked });
              });
            }}
          >
            Change…
          </button>
          {state.downloadPath.trim() && (
            <button
              type="button"
              className="settings-secondary-btn"
              onClick={() => patch({ downloadPath: "" })}
            >
              Reset to default
            </button>
          )}
        </div>
      </label>
      <Switch
        className="settings-toggle"
        checked={state.promptForDownload}
        onChange={(v) => patch({ promptForDownload: v })}
        label="Ask where to save each file before downloading"
      />
    </section>
  );
}

export function BrowsingSettingsSection({
  state,
  patch,
  variant = "card",
}: SectionProps & { variant?: "card" | "section" }) {
  const body = (
    <>
      <div className="settings-card-head">
        <div>
          <h2>Tabs & links</h2>
          <p>Control tab and link behavior.</p>
        </div>
      </div>
      <Switch
        className="settings-toggle"
        checked={state.closeWindowWithLastTab}
        onChange={(v) => patch({ closeWindowWithLastTab: v })}
        label="Close window when closing the last tab"
      />
      <Switch
        className="settings-toggle"
        checked={state.openLinksInNewTab}
        onChange={(v) => patch({ openLinksInNewTab: v })}
        label="Open links from other apps in a new tab"
      />
      <p className="settings-note">
        Middle-click and Ctrl+click still open links in new tabs regardless of this setting.
      </p>
    </>
  );

  if (variant === "section") {
    return <div className="settings-subsection">{body}</div>;
  }

  return <section className="settings-card">{body}</section>;
}

export function NewTabSettingsSection({ state, patch }: SectionProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2>New tab page</h2>
          <p>Customize the Inix start page.</p>
        </div>
      </div>
      <Switch
        className="settings-toggle"
        checked={state.newTabShowSearch}
        onChange={(v) => patch({ newTabShowSearch: v })}
        label="Show search box"
      />
      <Switch
        className="settings-toggle"
        checked={state.newTabShowQuickLinks}
        onChange={(v) => patch({ newTabShowQuickLinks: v })}
        label="Show quick links"
      />

      <div className="settings-divider" />

      <p className="settings-subhead-inline">Quick links</p>
      <ul className="alias-list">
        {state.quickLinks.map((link, index) => (
          <li key={`${link.url}-${index}`}>
            <input
              value={link.label}
              onChange={(e) => {
                const next = state.quickLinks.map((row, i) =>
                  i === index ? { ...row, label: e.target.value } : row
                );
                patch({ quickLinks: next });
              }}
              placeholder="Label"
            />
            <input
              value={link.url}
              onChange={(e) => {
                const next = state.quickLinks.map((row, i) =>
                  i === index ? { ...row, url: e.target.value } : row
                );
                patch({ quickLinks: next });
              }}
              placeholder="URL"
            />
            <button
              type="button"
              className="alias-remove"
              onClick={() => patch({ quickLinks: state.quickLinks.filter((_, i) => i !== index) })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {state.quickLinks.length < 12 && (
        <button
          type="button"
          className="settings-secondary-btn"
          onClick={() =>
            patch({
              quickLinks: [...state.quickLinks, { label: "New link", url: "https://" }],
            })
          }
        >
          Add quick link
        </button>
      )}
    </section>
  );
}
