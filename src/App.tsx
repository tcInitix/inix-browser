import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { NavBar, type AddressBarHandle } from "./components/NavBar";
import { NewTabPage } from "./components/NewTabPage";
import { LibraryPanel } from "./components/LibraryPanel";
import { AISidebar, type AiInjectRequest } from "./components/AISidebar";
import { SemanticSearch } from "./components/SemanticSearch";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsPage } from "./components/SettingsPage";
import { FindBar } from "./components/FindBar";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { ReaderView } from "./components/ReaderView";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { SavePasswordPrompt, type SavePasswordOffer } from "./components/SavePasswordPrompt";
import { VaultUnlockModal } from "./components/VaultUnlockModal";
import { BookmarkBar } from "./components/BookmarkBar";
import { UpdatePrompt, type UpdateState } from "./components/UpdatePrompt";
import { OnboardingFlow, type OnboardingResult } from "./components/OnboardingFlow";
import { PanicSetup } from "./components/PanicSetup";
import type { PermissionRequest, InixSettings } from "./inix.d";
import { parsePanicUrls, serializePanicUrls, normalizePanicUrls } from "./utils/panic";
import { applyFontScale, applyThemeMode, watchSystemTheme } from "./utils/apply-appearance";

const PANIC_PRELOAD_PREFIX = "inix-panic-preload-";
const isPanicPreloadId = (id: string) => id.startsWith(PANIC_PRELOAD_PREFIX);
import {
  createTab,
  normalizeUrl,
  isShellUrl,
  isLibraryUrl,
  isSettingsUrl,
  isNewTabUrl,
  setAliasMap,
  buildSessionSnapshot,
  flattenTabsFromSnapshot,
  setSearchEngineConfig,
  type Tab,
} from "./types";

const browser = () => window.inix?.browser;

interface SavedSession {
  tabs: Tab[];
  activeTabId: string;
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiInject, setAiInject] = useState<AiInjectRequest | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [readerContent, setReaderContent] = useState<{ title: string; url: string; text: string } | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [savePasswordOffer, setSavePasswordOffer] = useState<SavePasswordOffer | null>(null);
  const [vaultUnlockForSave, setVaultUnlockForSave] = useState(false);
  const pendingSavePassword = useRef<SavePasswordOffer | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [privateWindow, setPrivateWindow] = useState(false);
  const [bookmarkBarEnabled, setBookmarkBarEnabled] = useState(false);
  const [restoreTabsOnLaunch, setRestoreTabsOnLaunch] = useState(true);
  const closeWindowWithLastTab = useRef(false);
  const themeModeRef = useRef<InixSettings["theme_mode"]>("dark");

  const applyRuntimeSettings = useCallback((s: InixSettings) => {
    setSearchEngineConfig(s.default_search_engine, s.custom_search_url);
    applyThemeMode(s.theme_mode);
    applyFontScale(s.ui_font_scale);
    themeModeRef.current = s.theme_mode;
    setRestoreTabsOnLaunch(s.restore_tabs_on_launch);
    closeWindowWithLastTab.current = s.close_window_with_last_tab;
    setBookmarkBarEnabled(s.bookmark_bar_enabled);
  }, []);
  const [bookmarkBarRefresh, setBookmarkBarRefresh] = useState(0);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [panicMode, setPanicMode] = useState(false);
  const [panicSetupOpen, setPanicSetupOpen] = useState(false);
  const initialized = useRef(new Set<string>());
  const closedTabs = useRef<Tab[]>([]);
  const realSessionRef = useRef<SavedSession | null>(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  const addressBarRef = useRef<AddressBarHandle>(null);
  const focusAddressBarForTabRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restored = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const browserViewSuppressed =
    onboardingOpen ||
    panicSetupOpen ||
    !!permissionRequest ||
    !!savePasswordOffer ||
    vaultUnlockForSave ||
    updateState.status === "downloading" ||
    !!readerContent ||
    searchOpen ||
    historyOpen;

  const showToast = (msg: string, ms = 3000) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const queueAddressBarFocus = useCallback((tabId: string) => {
    focusAddressBarForTabRef.current = tabId;
  }, []);

  useEffect(() => {
    if (!sessionReady || focusAddressBarForTabRef.current !== activeTabId) return;
    focusAddressBarForTabRef.current = null;
    const frame = requestAnimationFrame(() => {
      addressBarRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTabId, sessionReady]);

  useEffect(() => {
    void (async () => {
      const windowMode = await window.inix?.window.getMode();
      const isPrivateWin = !!windowMode?.privateWindow;
      setPrivateWindow(isPrivateWin);

      if (isPrivateWin) {
        const tab = createTab(undefined, true);
        setTabs([tab]);
        setActiveTabId(tab.id);
        queueAddressBarFocus(tab.id);
        restored.current = true;
        setSessionReady(true);
        return;
      }

      const settings = await window.inix?.settings.getFormatted();
      if (settings) applyRuntimeSettings(settings);
      const startupMode =
        settings?.startup_mode ??
        (settings?.restore_tabs_on_launch !== false ? "restore" : "new_tab");
      const restoreTabs = startupMode === "restore";
      setRestoreTabsOnLaunch(restoreTabs);

      if (startupMode === "restore") {
        const snap = await window.inix?.session.getRestore();
        const wasCrash = await window.inix?.session.wasCrashRestore();
        if (restoreTabs && snap && Object.keys(snap.nodes).length > 0) {
          const restoredTabs = flattenTabsFromSnapshot(snap);
          setTabs(restoredTabs);
          setActiveTabId(snap.activeTabId);
          if (wasCrash) showToast("Restored your last session");
        } else {
          const tab = createTab();
          setTabs([tab]);
          setActiveTabId(tab.id);
          queueAddressBarFocus(tab.id);
        }
      } else if (startupMode === "homepage") {
        const url = settings?.homepage_url?.trim() || "inix://newtab";
        const tab = createTab(url);
        setTabs([tab]);
        setActiveTabId(tab.id);
        queueAddressBarFocus(tab.id);
        if (!isShellUrl(url)) void browser()?.navigate(tab.id, url);
      } else if (startupMode === "urls" && (settings?.startup_urls?.length ?? 0) > 0) {
        const urls = settings!.startup_urls;
        const newTabs = urls.map((url) => createTab(url.trim() || "inix://newtab"));
        setTabs(newTabs);
        setActiveTabId(newTabs[0].id);
        queueAddressBarFocus(newTabs[0].id);
        for (const tab of newTabs) {
          if (!isShellUrl(tab.url)) void browser()?.navigate(tab.id, tab.url);
        }
      } else {
        const tab = createTab();
        setTabs([tab]);
        setActiveTabId(tab.id);
        queueAddressBarFocus(tab.id);
      }
      restored.current = true;
      setSessionReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!sessionReady || tabs.length === 0 || !restoreTabsOnLaunch) return;
    const snapshot =
      panicMode && realSessionRef.current
        ? buildSessionSnapshot(realSessionRef.current.tabs, realSessionRef.current.activeTabId)
        : buildSessionSnapshot(tabs, activeTabId);
    void window.inix?.session.sync(snapshot);
  }, [tabs, activeTabId, sessionReady, panicMode, restoreTabsOnLaunch]);

  useEffect(() => {
    const onUnload = () => {
      if (tabs.length === 0 || !restoreTabsOnLaunch) return;
      const snapshot =
        panicMode && realSessionRef.current
          ? buildSessionSnapshot(realSessionRef.current.tabs, realSessionRef.current.activeTabId)
          : buildSessionSnapshot(tabs, activeTabId);
      void window.inix?.session.sync(snapshot);
      void window.inix?.session.flush(true);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [tabs, activeTabId, panicMode, restoreTabsOnLaunch]);

  useEffect(() => {
    void window.inix?.aliases.map().then((map) => {
      if (map) setAliasMap(map);
    });
  }, []);

  useEffect(() => {
    void window.inix?.window.isFullscreen().then((value) => setImmersive(!!value));
    const unsub = window.inix?.window.onFullscreenChanged((value) => setImmersive(value));
    return () => unsub?.();
  }, []);

  const openSettings = useCallback(() => {
    updateTab(activeTabId, { url: "inix://settings", title: "Settings", isLoading: false });
    browser()?.hide();
  }, [activeTabId, updateTab]);

  useEffect(() => {
    if (!sessionReady || privateWindow) return;
    void window.inix?.settings.get().then((all) => {
      if (all?.onboarding_completed !== "true") {
        setOnboardingOpen(true);
        void browser()?.hide();
      }
    });
  }, [sessionReady, privateWindow]);

  const completeOnboarding = useCallback(async (result: OnboardingResult) => {
    const s = window.inix?.settings;
    if (s) {
      await s.set("history_mode", result.historyMode);
      await s.set("bookmark_bar_enabled", result.bookmarkBar ? "true" : "false");
      await s.set("homepage_url", result.homepageUrl);
      await s.set("new_tab_use_homepage", result.newTabUseHomepage ? "true" : "false");
      await s.set("onboarding_completed", "true");
    }
    if (result.vaultPassword) {
      const vault = await window.inix?.vault.setup(result.vaultPassword);
      if (!vault?.ok) showToast(vault?.error ?? "Vault setup failed");
    }
    setBookmarkBarEnabled(result.bookmarkBar);
    await window.inix?.chrome.setBookmarkBar(result.bookmarkBar);
    setOnboardingOpen(false);
    showToast("Welcome to Inix");
  }, []);

  const handleFactoryReset = useCallback(() => {
    const b = browser();
    for (const tab of tabsRef.current) {
      b?.destroyTab(tab.id);
      initialized.current.delete(tab.id);
    }
    closedTabs.current = [];
    realSessionRef.current = null;
    setPanicMode(false);
    setAliasMap({});
    setBookmarkBarEnabled(false);
    void window.inix?.chrome.setBookmarkBar(false);
    const tab = createTab();
    initialized.current.clear();
    initialized.current.add(tab.id);
    setTabs([tab]);
    setActiveTabId(tab.id);
    setOnboardingOpen(true);
    b?.hide();
    showToast("Inix reset — complete setup to continue");
  }, []);

  useEffect(() => {
    void window.inix?.settings.getFormatted().then((s) => {
      if (s) applyRuntimeSettings(s);
    });
    return watchSystemTheme(() => {
      if (themeModeRef.current === "system") applyThemeMode("system");
    });
  }, [applyRuntimeSettings]);

  useEffect(() => {
    void window.inix?.chrome.setBookmarkBar(bookmarkBarEnabled);
  }, [bookmarkBarEnabled]);

  const refreshPanicPreload = useCallback(async () => {
    if (privateWindow || panicMode) return;
    const b = browser();
    if (!b?.panicSync) return;
    const all = await window.inix?.settings.get();
    const urls = normalizePanicUrls(parsePanicUrls(all?.panic_urls));
    if (urls.length > 0) {
      await b.panicSync(urls);
    }
  }, [privateWindow, panicMode]);

  useEffect(() => {
    if (!sessionReady || privateWindow) return;
    void refreshPanicPreload();
  }, [sessionReady, privateWindow, refreshPanicPreload]);

  useEffect(() => {
    window.inix?.sidebar.setOpen(sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sessionReady) return;
    const b = browser();
    if (!b) return;
    for (const tab of tabs) {
      if (!initialized.current.has(tab.id) && !tab.frozen) {
        initialized.current.add(tab.id);
        void b.createTab(tab.id, !!tab.private);
      }
    }
  }, [tabs, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !restored.current) return;
    const b = browser();
    if (!b) return;

    for (const tab of tabs) {
      if (tab.frozen) continue;
      if (!isShellUrl(tab.url)) {
        void b.navigate(tab.id, tab.url);
      }
    }
    restored.current = false;
  }, [sessionReady]);

  useEffect(() => {
    const b = browser();
    if (!b) return;
    return b.onUpdated(({ tabId, error, frozen, ...patch }) => {
      if (error && tabId === activeTabId) setLoadError(error);
      if (!error) setLoadError(null);
      updateTab(tabId, { ...patch, frozen: frozen ?? undefined });
    });
  }, [updateTab, activeTabId]);

  useEffect(() => {
    const unsub = window.inix?.browser.onOpenChild(({ parentTabId, url }) => {
      const child = createTab(url, false, parentTabId);
      setTabs((prev) => {
        const next = [...prev, child];
        return next.map((t) =>
          t.id === parentTabId ? { ...t, children: [...(t.children ?? []), child.id] } : t
        );
      });
      setActiveTabId(child.id);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const b = browser();
    if (!b || !activeTab) return;
    if (isShellUrl(activeTab.url) || browserViewSuppressed) {
      b.hide();
      setLoadError(null);
    } else if (activeTab.frozen) {
      void b.navigate(activeTabId, activeTab.url);
    } else {
      b.showTab(activeTabId);
    }
  }, [activeTabId, activeTab?.url, activeTab?.frozen, browserViewSuppressed]);

  useEffect(() => {
    if (!activeTab || isShellUrl(activeTab.url)) {
      setBookmarked(false);
      return;
    }
    window.inix?.bookmarks.check(activeTab.url).then(setBookmarked);
    void window.inix?.bookmarks.list({ query: activeTab.url }).then(async (list) => {
      const match = list?.find((b) => b.url === activeTab.url);
      if (match?.favicon_path) {
        const dataUrl = await window.inix?.bookmarks.favicon(match.favicon_path);
        if (dataUrl) updateTab(activeTabId, { favicon: dataUrl });
      }
    });
  }, [activeTab?.url, activeTabId, updateTab, activeTab]);

  const addTab = useCallback((isPrivate = false, parentId?: string | null) => {
    void (async () => {
      const forcePrivate = privateWindow || isPrivate;
      const settings = await window.inix?.settings.getFormatted();
      const url = forcePrivate
        ? "inix://newtab"
        : settings?.new_tab_use_homepage
          ? settings.homepage_url?.trim() || "inix://newtab"
          : "inix://newtab";
      const tab = createTab(url, forcePrivate, parentId);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      queueAddressBarFocus(tab.id);
      if (forcePrivate) showToast("Private tab — history won't be saved");
      if (!isShellUrl(url)) {
        void browser()?.navigate(tab.id, url);
      }
    })();
  }, [privateWindow, queueAddressBarFocus]);

  const openLibrary = useCallback(() => {
    updateTab(activeTabId, { url: "inix://library", title: "Inix Library", isLoading: false });
    browser()?.hide();
  }, [activeTabId, updateTab]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const closing = prev.find((t) => t.id === id);
        if (closing && !closing.private) {
          closedTabs.current = [closing, ...closedTabs.current].slice(0, 25);
        }
        browser()?.destroyTab(id);
        initialized.current.delete(id);
        if (prev.length === 1) {
          if (closeWindowWithLastTab.current) {
            window.inix?.window.close();
            return prev;
          }
          const fresh = createTab();
          setActiveTabId(fresh.id);
          queueAddressBarFocus(fresh.id);
          return [fresh];
        }
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev
          .filter((t) => t.id !== id)
          .map((t) => ({
            ...t,
            children: (t.children ?? []).filter((c) => c !== id),
          }));
        if (id === activeTabId) {
          setActiveTabId(next[Math.min(idx, next.length - 1)].id);
        }
        return next;
      });
    },
    [activeTabId, queueAddressBarFocus]
  );

  const closeOtherTabs = useCallback((keepId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const keep = prev.find((t) => t.id === keepId);
      if (!keep) return prev;

      for (const tab of prev) {
        if (tab.id === keepId) continue;
        if (!tab.private) {
          closedTabs.current = [tab, ...closedTabs.current].slice(0, 25);
        }
        browser()?.destroyTab(tab.id);
        initialized.current.delete(tab.id);
      }

      setActiveTabId(keepId);
      return [keep];
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs((prev) => {
      for (const tab of prev) {
        if (!tab.private) {
          closedTabs.current = [tab, ...closedTabs.current].slice(0, 25);
        }
        browser()?.destroyTab(tab.id);
        initialized.current.delete(tab.id);
      }
      const fresh = createTab();
      setActiveTabId(fresh.id);
      queueAddressBarFocus(fresh.id);
      return [fresh];
    });
  }, [queueAddressBarFocus]);

  const reopenClosedTab = useCallback(() => {
    const closed = closedTabs.current.shift();
    if (!closed) {
      showToast("No closed tabs to reopen");
      return;
    }
    const tab = createTab(closed.url, !!closed.private, closed.parentId);
    tab.title = closed.title;
    tab.pinned = closed.pinned;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    if (!isShellUrl(closed.url)) {
      void browser()?.navigate(tab.id, closed.url);
    }
  }, []);

  const pinTab = useCallback((id: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  }, []);

  const duplicateTab = useCallback(
    (id: string) => {
      const source = tabs.find((t) => t.id === id);
      if (!source) return;
      const tab = createTab(source.url, !!source.private, source.parentId);
      tab.title = source.title;
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      if (!isShellUrl(source.url)) {
        void browser()?.navigate(tab.id, source.url);
      }
    },
    [tabs]
  );

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const navigate = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      const url = normalizeUrl(trimmed);
      setLoadError(null);
      flushSync(() => {
        updateTab(activeTabId, {
          url,
          isLoading: !isShellUrl(url),
          navKey: Date.now(),
          title: isLibraryUrl(url) ? "Inix Library" : isSettingsUrl(url) ? "Settings" : undefined,
          frozen: false,
          secure: url.startsWith("https://"),
        });
      });

      const b = browser();
      if (!b) {
        showToast("Browser not ready — try again");
        return;
      }

      if (isShellUrl(url)) {
        await b.hide();
      } else {
        await b.navigate(activeTabId, url);
        await b.showTab(activeTabId);
      }
    },
    [activeTabId, updateTab]
  );

  const goHome = useCallback(() => {
    void window.inix?.settings.getFormatted().then((settings) => {
      const url = settings?.homepage_url?.trim() || "inix://newtab";
      void navigate(url);
    });
  }, [navigate]);

  const enterPanic = useCallback(async (urls: string[]) => {
    const b = browser();
    if (!b?.panicSync || !b.panicActivate) return;

    const currentTabs = tabsRef.current;
    const currentActive = activeTabIdRef.current;

    realSessionRef.current = {
      tabs: currentTabs.map((t) => ({ ...t, children: [...(t.children ?? [])] })),
      activeTabId: currentActive,
    };

    setSidebarOpen(false);
    setSearchOpen(false);
    setHistoryOpen(false);
    setFindOpen(false);
    setDownloadsOpen(false);
    setReaderContent(null);
    setLoadError(null);

    for (const tab of currentTabs) {
      if (isPanicPreloadId(tab.id)) continue;
      b.destroyTab(tab.id);
      initialized.current.delete(tab.id);
    }

    const panicUrls = normalizePanicUrls(urls);
    const safeUrls = panicUrls.length > 0 ? panicUrls : [normalizeUrl("https://www.google.com")];

    const preloaded = await b.panicSync(safeUrls);

    const panicTabs: Tab[] = preloaded.map((p) => ({
      id: p.tabId,
      title: p.title,
      url: p.url,
      isLoading: p.isLoading,
      canGoBack: false,
      canGoForward: false,
      navKey: Date.now(),
    }));

    for (const tab of panicTabs) {
      initialized.current.add(tab.id);
    }

    setPanicMode(true);
    setTabs(panicTabs);
    setActiveTabId(panicTabs[0]!.id);

    await b.panicActivate();
  }, []);

  const exitPanic = useCallback(async () => {
    const saved = realSessionRef.current;
    if (!saved) return;

    const b = browser();
    const currentTabs = tabsRef.current;

    const all = await window.inix?.settings.get();
    const configuredUrls = normalizePanicUrls(parsePanicUrls(all?.panic_urls));

    for (const tab of currentTabs) {
      initialized.current.delete(tab.id);
    }

    if (b?.panicDeactivate) {
      await b.panicDeactivate(configuredUrls);
    }

    setPanicMode(false);
    setTabs(saved.tabs);
    setActiveTabId(saved.activeTabId);
    realSessionRef.current = null;
    setLoadError(null);

    if (!b) return;

    for (const tab of saved.tabs) {
      if (tab.frozen) continue;
      initialized.current.add(tab.id);
    }

    for (const tab of saved.tabs) {
      if (tab.frozen) continue;
      await b.createTab(tab.id, !!tab.private);
      if (!isShellUrl(tab.url)) {
        await b.navigate(tab.id, tab.url);
      }
    }

    const active = saved.tabs.find((t) => t.id === saved.activeTabId);
    if (active && !isShellUrl(active.url) && !active.frozen) {
      await b.showTab(saved.activeTabId);
    } else {
      await b.hide();
    }

    void refreshPanicPreload();
  }, [refreshPanicPreload]);

  const togglePanic = useCallback(async () => {
    if (privateWindow) {
      showToast("Panic switch isn't available in private windows");
      return;
    }
    if (panicMode) {
      await exitPanic();
      return;
    }

    const all = await window.inix?.settings.get();
    const configured = all?.panic_configured === "true";
    const urls = parsePanicUrls(all?.panic_urls);

    if (!configured || urls.length === 0) {
      setPanicSetupOpen(true);
      browser()?.hide();
      return;
    }

    await enterPanic(urls);
  }, [privateWindow, panicMode, enterPanic, exitPanic]);

  const savePanicSetup = useCallback(
    async (urls: string[]) => {
      const serialized = serializePanicUrls(urls);
      await window.inix?.settings.set("panic_urls", serialized);
      await window.inix?.settings.set("panic_configured", "true");
      setPanicSetupOpen(false);
      await enterPanic(urls);
    },
    [enterPanic]
  );

  useEffect(() => {
    const unsub = window.inix?.shortcuts.onAction((action) => {
      switch (action) {
        case "new-tab":
          addTab(false);
          break;
        case "new-private-tab":
          void (async () => {
            const settings = await window.inix?.settings.getFormatted();
            if (settings?.private_mode_shortcut === "tab") {
              addTab(true);
            } else {
              await window.inix?.window.openPrivate();
            }
          })();
          break;
        case "history":
          setHistoryOpen(true);
          break;
        case "library":
          openLibrary();
          break;
        case "close-tab":
          closeTab(activeTabId);
          break;
        case "reload":
          setLoadError(null);
          browser()?.reload(activeTabId);
          break;
        case "focus-address":
          addressBarRef.current?.focus();
          break;
        case "find":
          setFindOpen(true);
          break;
        case "devtools":
          void browser()?.toggleDevTools(activeTabId);
          break;
        case "print":
          void browser()?.print(activeTabId);
          break;
        case "fullscreen":
          void window.inix?.window.toggleFullscreen();
          break;
        case "zoom-in":
          void browser()?.zoomIn(activeTabId);
          break;
        case "zoom-out":
          void browser()?.zoomOut(activeTabId);
          break;
        case "zoom-reset":
          void browser()?.zoomReset(activeTabId);
          break;
        case "reopen-tab":
          reopenClosedTab();
          break;
        case "next-tab": {
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          if (idx >= 0 && tabs.length > 1) {
            setActiveTabId(tabs[(idx + 1) % tabs.length].id);
          }
          break;
        }
        case "prev-tab": {
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          if (idx >= 0 && tabs.length > 1) {
            setActiveTabId(tabs[(idx - 1 + tabs.length) % tabs.length].id);
          }
          break;
        }
        case "home":
          goHome();
          break;
        case "panic":
          void togglePanic();
          break;
      }
    });
    return () => unsub?.();
  }, [addTab, openLibrary, closeTab, activeTabId, tabs, navigate, reopenClosedTab, goHome, togglePanic]);

  const openAiLink = useCallback(
    async (rawUrl: string) => {
      const url = normalizeUrl(rawUrl);
      if (!/^https?:\/\//i.test(url)) return;

      setLoadError(null);
      updateTab(activeTabId, {
        url,
        isLoading: true,
        navKey: Date.now(),
        frozen: false,
      });

      const b = browser();
      if (!b) return;

      await b.navigate(activeTabId, url);
      await b.showTab(activeTabId);
    },
    [activeTabId, updateTab]
  );

  const toggleBookmark = async () => {
    if (!activeTab || isShellUrl(activeTab.url)) return;
    if (bookmarked) {
      await window.inix?.bookmarks.remove(activeTab.url);
      setBookmarked(false);
      setBookmarkBarRefresh((k) => k + 1);
      showToast("Removed from Library");
    } else {
      showToast("Saving to Library · archiving…");
      const result = await window.inix?.bookmarks.saveFromTab(activeTabId);
      if (result?.ok) {
        setBookmarked(true);
        setBookmarkBarRefresh((k) => k + 1);
        showToast(bookmarkBarEnabled ? "Saved · added to bookmarks bar" : "Saved · Inix Archive ready");
      } else {
        showToast(result?.error ?? "Bookmark failed");
      }
    }
  };

  const openReaderMode = useCallback(async () => {
    const content = await browser()?.getReaderContent(activeTabId);
    if (content?.text) setReaderContent(content);
    else showToast("Reader view unavailable for this page");
  }, [activeTabId]);

  useEffect(() => {
    const unsub = window.inix?.autofill.onSaveOffer((offer) => setSavePasswordOffer(offer));
    return () => unsub?.();
  }, []);

  const persistSavePasswordOffer = useCallback(async (offer: SavePasswordOffer) => {
    const configured = await window.inix?.vault.isConfigured();
    if (!configured) {
      showToast("Set up the vault in Settings → Vault to save passwords");
      setSavePasswordOffer(null);
      return;
    }
    const unlocked = await window.inix?.vault.isUnlocked();
    if (!unlocked) {
      pendingSavePassword.current = offer;
      setVaultUnlockForSave(true);
      return;
    }
    const result = await window.inix?.autofill.saveCredential({
      origin: offer.origin,
      username: offer.username,
      password: offer.password,
      title: offer.title,
    });
    setSavePasswordOffer(null);
    if (result?.ok) showToast("Password saved to vault");
    else showToast(result?.error ?? "Could not save password");
  }, []);

  useEffect(() => {
    const unsubRequest = window.inix?.permission.onRequest((req) => setPermissionRequest(req));
    const unsubDismiss = window.inix?.permission.onDismiss(({ id }) => {
      setPermissionRequest((prev) => (prev?.id === id ? null : prev));
    });
    return () => {
      unsubRequest?.();
      unsubDismiss?.();
    };
  }, []);

  useEffect(() => {
    const unsubs = [
      window.inix?.update.onAvailable((info) =>
        setUpdateState({
          status: "available",
          version: info.version,
          releaseNotes: info.releaseNotes,
        })
      ),
      window.inix?.update.onNotAvailable(() => {
        // manual checks show toast from Settings
      }),
      window.inix?.update.onProgress((p) =>
        setUpdateState({ status: "downloading", percent: p.percent })
      ),
      window.inix?.update.onReady((info) =>
        setUpdateState({ status: "ready", version: info.version })
      ),
    ];
    return () => unsubs.forEach((u) => u?.());
  }, []);

  useEffect(() => {
    const unsub = window.inix?.context.onAction((action) => {
      if (action.type === "open-link-new-tab" && action.url) {
        const child = createTab(action.url, false, action.parentTabId);
        setTabs((prev) => [...prev, child]);
        setActiveTabId(child.id);
      } else if (action.type === "search-text" && action.text) {
        navigate(action.text);
      } else if (action.type === "send-to-ai") {
        const tabId = action.tabId ?? activeTabId;
        setSidebarOpen(true);
        setAiInject({
          id: crypto.randomUUID(),
          tabId,
          text: action.text,
        });
      }
    });
    return () => unsub?.();
  }, [navigate, activeTabId]);

  useEffect(() => {
    const unsub = window.inix?.downloads.onUpdated(() => {
      showToast("Download updated", 2000);
    });
    return () => unsub?.();
  }, []);

  if (!sessionReady || !activeTab) {
    return <div className="inix-shell loading-shell">Loading Inix…</div>;
  }

  const renderContent = () => {
    if (isLibraryUrl(activeTab.url)) {
      return <LibraryPanel onNavigate={navigate} />;
    }
    if (isSettingsUrl(activeTab.url)) {
      return (
        <SettingsPage
          onNavigate={navigate}
          onAliasesChanged={(map) => setAliasMap(map)}
          onBookmarkBarChange={setBookmarkBarEnabled}
          onRestoreTabsChange={setRestoreTabsOnLaunch}
          onSettingsApplied={applyRuntimeSettings}
          onFactoryReset={handleFactoryReset}
        />
      );
    }
    if (isNewTabUrl(activeTab.url)) {
      return (
        <NewTabPage
          onNavigate={navigate}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenLibrary={openLibrary}
        />
      );
    }
    return (
      <div className="browser-panel">
        {loadError && (
          <div className="load-error">
            <p>Failed to load page</p>
            <span>{loadError}</span>
            <button onClick={() => navigate(activeTab.url)}>Retry</button>
          </div>
        )}
        {activeTab.isLoading && !loadError && (
          <div className="loading-indicator">
            <span className="tab-spinner" />
            Loading…
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`inix-shell${sidebarOpen ? " sidebar-open" : ""}${immersive ? " immersive" : ""}${bookmarkBarEnabled ? " bookmark-bar-open" : ""}`}>
      <TitleBar
        onOpenSettings={openSettings}
        onOpenLibrary={openLibrary}
        onPanic={() => void togglePanic()}
        privateWindow={privateWindow}
      />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onClose={closeTab}
        onCloseOthers={closeOtherTabs}
        onCloseAll={closeAllTabs}
        onNewTab={() => addTab()}
        onPin={pinTab}
        onDuplicate={duplicateTab}
        onReorder={reorderTabs}
      />
      <NavBar
        ref={addressBarRef}
        tab={activeTab}
        onNavigate={navigate}
        onNewTab={() => addTab()}
        onBack={() => browser()?.goBack(activeTabId)}
        onForward={() => browser()?.goForward(activeTabId)}
        onReload={() => {
          setLoadError(null);
          browser()?.reload(activeTabId);
        }}
        onHome={goHome}
        onOpenSearch={() => setSearchOpen(true)}
        onToggleAI={() => setSidebarOpen((v) => !v)}
        onToggleBookmark={toggleBookmark}
        onOpenLibrary={openLibrary}
        onOpenDownloads={() => setDownloadsOpen(true)}
        onReaderMode={() => void openReaderMode()}
        bookmarked={bookmarked}
        aiOpen={sidebarOpen}
        onOpenSettings={openSettings}
      />
      {bookmarkBarEnabled && !immersive && (
        <BookmarkBar
          refreshKey={bookmarkBarRefresh}
          activeTabId={activeTabId}
          onNavigate={navigate}
          onOpenNewTab={(url) => {
            const tab = createTab(url);
            setTabs((prev) => [...prev, tab]);
            setActiveTabId(tab.id);
          }}
          onChanged={() => setBookmarkBarRefresh((k) => k + 1)}
        />
      )}
      <FindBar open={findOpen} tabId={activeTabId} onClose={() => setFindOpen(false)} />
      <div className="main-row">
        <main className="content-area">{renderContent()}</main>
        <AISidebar
          tabId={aiInject?.tabId ?? activeTabId}
          open={sidebarOpen}
          hasPage={!isShellUrl(activeTab.url)}
          onClose={() => setSidebarOpen(false)}
          onOpenLink={openAiLink}
          injectRequest={aiInject}
          onInjectConsumed={() => setAiInject(null)}
        />
      </div>
      <footer className="status-bar">
        {activeTab.private || privateWindow ? (
          <>
            <span className="privacy-badge private-tab-badge">
              {privateWindow ? "Private window" : "Private tab"}
            </span>
            <span className="status-divider" />
            <span className="status-text">History not saved · Tracker blocking active</span>
          </>
        ) : (
          <>
            <span className="privacy-badge">Private</span>
            <span className="status-divider" />
            <span className="status-text">
              Tracker blocking active · Inix AI local
              {activeTab.zoomLevel != null && activeTab.zoomLevel !== 0 && (
                <> · Zoom {Math.round(Math.pow(1.2, activeTab.zoomLevel) * 100)}%</>
              )}
            </span>
          </>
        )}
      </footer>

      {readerContent && (
        <ReaderView
          title={readerContent.title}
          url={readerContent.url}
          text={readerContent.text}
          onClose={() => setReaderContent(null)}
        />
      )}

      <DownloadsPanel open={downloadsOpen} onClose={() => setDownloadsOpen(false)} />

      <PermissionPrompt
        request={permissionRequest}
        onRespond={async (allow) => {
          if (permissionRequest) {
            await window.inix?.permission.respond(permissionRequest.id, allow);
          }
          setPermissionRequest(null);
        }}
      />

      <SavePasswordPrompt
        offer={savePasswordOffer}
        onDismiss={() => setSavePasswordOffer(null)}
        onSave={() => {
          if (!savePasswordOffer) return;
          void persistSavePasswordOffer(savePasswordOffer);
        }}
      />

      <VaultUnlockModal
        open={vaultUnlockForSave}
        onClose={() => {
          pendingSavePassword.current = null;
          setVaultUnlockForSave(false);
        }}
        onUnlocked={() => {
          setVaultUnlockForSave(false);
          const pending = pendingSavePassword.current;
          pendingSavePassword.current = null;
          if (pending) void persistSavePasswordOffer(pending);
        }}
      />

      <UpdatePrompt
        state={updateState}
        onDismiss={() => setUpdateState({ status: "idle" })}
        onDownload={async () => {
          setUpdateState({ status: "downloading", percent: 0 });
          const result = await window.inix?.update.download();
          if (!result?.ok) {
            setUpdateState({
              status: "error",
              message: result?.error ?? "Download failed",
            });
          }
        }}
        onInstall={() => void window.inix?.update.install()}
      />

      {onboardingOpen && <OnboardingFlow onComplete={(r) => void completeOnboarding(r)} />}

      {panicSetupOpen && (
        <PanicSetup
          onCancel={() => setPanicSetupOpen(false)}
          onSave={(urls) => savePanicSetup(urls)}
        />
      )}

      {toast && <div className="inix-toast">{toast}</div>}

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} onNavigate={navigate} />
      <SemanticSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={navigate} />

      {immersive && <div className="immersive-hint">Press F11 to exit fullscreen</div>}
    </div>
  );
}
