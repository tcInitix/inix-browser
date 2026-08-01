import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { NavBar, type AddressBarHandle } from "./components/NavBar";
import { NewTabPage } from "./components/NewTabPage";
import { LibraryPanel } from "./components/LibraryPanel";
import { AISidebar } from "./components/AISidebar";
import { SemanticSearch } from "./components/SemanticSearch";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsPage } from "./components/SettingsPage";
import { FindBar } from "./components/FindBar";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { ReaderView } from "./components/ReaderView";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { SavePasswordPrompt, type SavePasswordOffer } from "./components/SavePasswordPrompt";
import { BookmarkBar } from "./components/BookmarkBar";
import { UpdatePrompt, type UpdateState } from "./components/UpdatePrompt";
import type { PermissionRequest } from "./inix.d";
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
  type Tab,
} from "./types";

const browser = () => window.inix?.browser;

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [readerContent, setReaderContent] = useState<{ title: string; url: string; text: string } | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [savePasswordOffer, setSavePasswordOffer] = useState<SavePasswordOffer | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [privateWindow, setPrivateWindow] = useState(false);
  const [bookmarkBarEnabled, setBookmarkBarEnabled] = useState(false);
  const [bookmarkBarRefresh, setBookmarkBarRefresh] = useState(0);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });
  const initialized = useRef(new Set<string>());
  const closedTabs = useRef<Tab[]>([]);
  const addressBarRef = useRef<AddressBarHandle>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restored = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const browserViewSuppressed =
    !!permissionRequest ||
    !!savePasswordOffer ||
    updateState.status === "available" ||
    updateState.status === "ready" ||
    updateState.status === "error" ||
    downloadsOpen ||
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

  useEffect(() => {
    void (async () => {
      const mode = await window.inix?.window.getMode();
      const isPrivateWin = !!mode?.privateWindow;
      setPrivateWindow(isPrivateWin);

      if (isPrivateWin) {
        const tab = createTab(undefined, true);
        setTabs([tab]);
        setActiveTabId(tab.id);
        restored.current = true;
        setSessionReady(true);
        return;
      }

      const snap = await window.inix?.session.getRestore();
      const wasCrash = await window.inix?.session.wasCrashRestore();
      if (snap && Object.keys(snap.nodes).length > 0) {
        const restoredTabs = flattenTabsFromSnapshot(snap);
        setTabs(restoredTabs);
        setActiveTabId(snap.activeTabId);
        if (wasCrash) showToast("Restored your last session");
      } else {
        const tab = createTab();
        setTabs([tab]);
        setActiveTabId(tab.id);
      }
      restored.current = true;
      setSessionReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!sessionReady || tabs.length === 0) return;
    const snapshot = buildSessionSnapshot(tabs, activeTabId);
    void window.inix?.session.sync(snapshot);
  }, [tabs, activeTabId, sessionReady]);

  useEffect(() => {
    const onUnload = () => {
      if (tabs.length > 0) {
        void window.inix?.session.sync(buildSessionSnapshot(tabs, activeTabId));
        void window.inix?.session.flush(true);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [tabs, activeTabId]);

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
    void window.inix?.settings.getFormatted().then((s) => {
      if (s?.bookmark_bar_enabled != null) {
        setBookmarkBarEnabled(s.bookmark_bar_enabled);
      }
    });
  }, []);

  useEffect(() => {
    void window.inix?.chrome.setBookmarkBar(bookmarkBarEnabled);
  }, [bookmarkBarEnabled]);

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
      if (forcePrivate) showToast("Private tab — history won't be saved");
      if (!isShellUrl(url)) {
        void browser()?.navigate(tab.id, url);
      }
    })();
  }, [privateWindow]);

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
          const fresh = createTab();
          setActiveTabId(fresh.id);
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
    [activeTabId]
  );

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
      }
    });
    return () => unsub?.();
  }, [addTab, openLibrary, closeTab, activeTabId, tabs, navigate, reopenClosedTab, goHome]);

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

  useEffect(() => {
    const unsub = window.inix?.permission.onRequest((req) => setPermissionRequest(req));
    return () => unsub?.();
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
      window.inix?.update.onError((err) =>
        setUpdateState({ status: "error", message: err.message })
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
      }
    });
    return () => unsub?.();
  }, [navigate]);

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
      <TitleBar onOpenSettings={openSettings} onOpenLibrary={openLibrary} privateWindow={privateWindow} />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onClose={closeTab}
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
      />
      {bookmarkBarEnabled && !immersive && (
        <BookmarkBar
          refreshKey={bookmarkBarRefresh}
          onNavigate={navigate}
          onOpenNewTab={(url) => {
            const tab = createTab(url);
            setTabs((prev) => [...prev, tab]);
            setActiveTabId(tab.id);
          }}
        />
      )}
      <FindBar open={findOpen} tabId={activeTabId} onClose={() => setFindOpen(false)} />
      <div className="main-row">
        <main className="content-area">{renderContent()}</main>
        <AISidebar
          tabId={activeTabId}
          open={sidebarOpen}
          hasPage={!isShellUrl(activeTab.url)}
          onClose={() => setSidebarOpen(false)}
          onOpenLink={openAiLink}
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
        onSave={async () => {
          if (!savePasswordOffer) return;
          const result = await window.inix?.autofill.saveCredential({
            origin: savePasswordOffer.origin,
            username: savePasswordOffer.username,
            password: savePasswordOffer.password,
            title: savePasswordOffer.title,
          });
          setSavePasswordOffer(null);
          if (result?.ok) showToast("Password saved to vault");
          else showToast(result?.error ?? "Could not save password");
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

      {toast && <div className="inix-toast">{toast}</div>}

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} onNavigate={navigate} />
      <SemanticSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={navigate} />

      {immersive && <div className="immersive-hint">Press F11 to exit fullscreen</div>}
    </div>
  );
}
