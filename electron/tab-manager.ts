import { BrowserView, BrowserWindow, type WebContents } from "electron";
import path from "node:path";

import { wireContextMenu } from "./context-menu";

import { onPageLoaded } from "./storage/capture-service";

import { recordLightVisit } from "./storage/history";

import { resolveInixUrl } from "./storage/inix-url";

import { matchShortcut } from "./shortcuts";

import { captureTabState, onTabFrozen, onTabUnfrozen } from "./session/tab-freezer";

import {
  PRIVATE_PARTITION,
  getProfilePartition,
  getWindowProfileId,
  initProfileSessions,
} from "./profiles/manager";

import { getSettings } from "./storage/settings";
import { getAutofillBootstrapScript } from "./autofill/inject";

export const BASE_TOP_CHROME = 132;
export const BOOKMARK_BAR_HEIGHT = 36;
export const TOP_CHROME = BASE_TOP_CHROME;

export const BOTTOM_CHROME = 32;

export const SIDEBAR_WIDTH = 360;



export interface TabUpdate {

  tabId: string;

  title?: string;

  url?: string;

  isLoading?: boolean;

  canGoBack?: boolean;

  canGoForward?: boolean;

  error?: string;

  frozen?: boolean;

  secure?: boolean;

  securityState?: "secure" | "insecure" | "warning" | "unknown";

  securityDetail?: string;

  zoomLevel?: number;

}



type NewTabHandler = (win: BrowserWindow, parentTabId: string, url: string) => void;



interface PerWindowState {

  window: BrowserWindow;

  activeTabId: string | null;

  sidebarOpen: boolean;

  chromeHidden: boolean;

  resizeTimer: ReturnType<typeof setTimeout> | null;

  listeners: {

    onResize: () => void;

    onLayout: () => void;

  } | null;

}



export class TabManager {

  private views = new Map<string, BrowserView>();

  private tabWindows = new Map<string, BrowserWindow>();

  private perWindow = new Map<number, PerWindowState>();

  private privateTabs = new Set<string>();

  private frozenTabs = new Set<string>();
  private frozenMeta = new Map<string, { url: string; title: string; isPrivate: boolean }>();

  private lastActiveAt = new Map<string, number>();

  private pendingScroll = new Map<string, number>();

  private zoomLevels = new Map<string, number>();

  private certErrors = new Set<string>();

  private findRequestId = 0;

  private bookmarkBarVisible = false;

  private onNewTab: NewTabHandler | null = null;

  private static readonly PANIC_PRELOAD_PREFIX = "inix-panic-preload-";

  private panicPreloadUrls: string[] = [];

  private panicPreloadTabs = new Set<string>();

  isPanicPreloadTab(tabId: string): boolean {
    return tabId.startsWith(TabManager.PANIC_PRELOAD_PREFIX);
  }

  private panicPreloadTabId(index: number): string {
    return `${TabManager.PANIC_PRELOAD_PREFIX}${index}`;
  }

  private titleFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "New Tab";
    }
  }

  private panicPreloadSnapshot(tabId: string, fallbackUrl: string) {
    const wc = this.views.get(tabId)?.webContents;
    const liveUrl = wc?.getURL();
    const url =
      liveUrl && liveUrl !== "about:blank" ? liveUrl : fallbackUrl;
    return {
      tabId,
      url,
      title: wc?.getTitle() || this.titleFromUrl(url),
      isLoading: wc?.isLoading() ?? false,
    };
  }

  async syncPanicPreload(
    win: BrowserWindow,
    urls: string[]
  ): Promise<Array<{ tabId: string; url: string; title: string; isLoading: boolean }>> {
    const prevCount = this.panicPreloadUrls.length;

    for (let i = urls.length; i < prevCount; i++) {
      const id = this.panicPreloadTabId(i);
      if (this.views.has(id)) {
        this.destroyTab(id);
        this.panicPreloadTabs.delete(id);
      }
    }

    const result: Array<{ tabId: string; url: string; title: string; isLoading: boolean }> = [];

    for (let i = 0; i < urls.length; i++) {
      const id = this.panicPreloadTabId(i);
      const url = urls[i]!;
      this.panicPreloadTabs.add(id);

      const urlChanged = this.panicPreloadUrls[i] !== url;
      if (!this.views.has(id)) {
        this.createTab(win, id, false);
        await this.loadInBackground(win, id, url);
      } else if (urlChanged) {
        await this.loadInBackground(win, id, url);
      }

      result.push(this.panicPreloadSnapshot(id, url));
    }

    this.panicPreloadUrls = [...urls];
    return result;
  }

  activatePanicPreload(win: BrowserWindow): void {
    const firstId = this.panicPreloadTabId(0);
    if (this.views.has(firstId)) {
      this.showTab(win, firstId);
    }
  }

  async deactivatePanicPreload(win: BrowserWindow, urls: string[]): Promise<void> {
    const state = this.pw(win);
    if (state.activeTabId && this.isPanicPreloadTab(state.activeTabId)) {
      this.hide(win);
    }
    if (urls.length > 0) {
      await this.syncPanicPreload(win, urls);
    }
  }



  private pw(win: BrowserWindow): PerWindowState {

    let state = this.perWindow.get(win.id);

    if (!state) {

      state = {

        window: win,

        activeTabId: null,

        sidebarOpen: false,

        chromeHidden: false,

        resizeTimer: null,

        listeners: null,

      };

      this.perWindow.set(win.id, state);

    }

    return state;

  }



  private winForTab(tabId: string): BrowserWindow | null {

    const win = this.tabWindows.get(tabId);

    return win && !win.isDestroyed() ? win : null;

  }



  attachWindow(win: BrowserWindow) {

    const state = this.pw(win);

    if (state.listeners) return;

    const onResize = () => this.onWindowResize(win);

    const onLayout = () => this.layoutActiveView(win);

    win.on("resize", onResize);

    win.on("maximize", onLayout);

    win.on("unmaximize", onLayout);

    win.on("enter-full-screen", onLayout);

    win.on("leave-full-screen", onLayout);

    state.listeners = { onResize, onLayout };

  }



  setNewTabHandler(handler: NewTabHandler) {

    this.onNewTab = handler;

  }



  setSidebarOpen(win: BrowserWindow, open: boolean) {

    this.pw(win).sidebarOpen = open;

    this.layoutActiveView(win);

  }



  setChromeHidden(win: BrowserWindow, hidden: boolean) {

    this.pw(win).chromeHidden = hidden;

    this.layoutActiveView(win);

  }



  setBookmarkBarVisible(visible: boolean): void {

    this.bookmarkBarVisible = visible;

    for (const state of this.perWindow.values()) {

      if (!state.window.isDestroyed()) {

        this.layoutActiveView(state.window);

      }

    }

  }



  private topChrome(): number {

    return BASE_TOP_CHROME + (this.bookmarkBarVisible ? BOOKMARK_BAR_HEIGHT : 0);

  }



  isChromeHidden(win: BrowserWindow): boolean {

    return this.pw(win).chromeHidden;

  }



  getWebContents(tabId: string): WebContents | null {

    return this.views.get(tabId)?.webContents ?? null;

  }



  getWindowForTab(tabId: string): BrowserWindow | null {

    return this.winForTab(tabId);

  }



  getTabIdForWebContents(wcId: number): string | null {

    for (const [tabId, view] of this.views) {

      if (view.webContents.id === wcId) return tabId;

    }

    return null;

  }



  isViewActive(tabId: string): boolean {

    const win = this.winForTab(tabId);

    if (!win) return false;

    const state = this.pw(win);

    if (state.activeTabId !== tabId) return false;

    const view = this.views.get(tabId);

    return !!view && win.getBrowserView() === view;

  }



  getTabUrl(tabId: string): string {
    const meta = this.frozenMeta.get(tabId);
    if (meta) return meta.url;
    const wc = this.getWebContents(tabId);
    if (wc && !wc.isDestroyed()) return wc.getURL();
    return "";
  }



  isPrivate(tabId: string): boolean {

    return this.privateTabs.has(tabId);

  }



  isFrozen(tabId: string): boolean {

    return this.frozenTabs.has(tabId);

  }



  getActiveTabId(win?: BrowserWindow | null): string | null {

    if (win) return this.pw(win).activeTabId;

    for (const state of this.perWindow.values()) {

      if (state.activeTabId) return state.activeTabId;

    }

    return null;

  }



  getAllTabIds(): string[] {

    const ids = new Set<string>([...this.views.keys(), ...this.frozenTabs]);

    return [...ids];

  }



  getBackgroundTabIds(): string[] {

    const activeIds = new Set(

      [...this.perWindow.values()].map((s) => s.activeTabId).filter(Boolean) as string[]

    );

    const ids: string[] = [];

    for (const tabId of this.views.keys()) {

      if (!activeIds.has(tabId)) ids.push(tabId);

    }

    for (const tabId of this.frozenTabs) {

      if (!activeIds.has(tabId) && !ids.includes(tabId)) ids.push(tabId);

    }

    return ids;

  }



  getLastActiveAt(tabId: string): number {

    return this.lastActiveAt.get(tabId) ?? Date.now();

  }



  touchTab(tabId: string): void {

    this.lastActiveAt.set(tabId, Date.now());

  }



  setPendingScroll(tabId: string, scrollY: number): void {

    if (scrollY > 0) this.pendingScroll.set(tabId, scrollY);

  }



  private bounds(win: BrowserWindow) {

    const state = this.pw(win);

    const [width, height] = win.getContentSize();

    if (state.chromeHidden) {

      return { x: 0, y: 0, width, height };

    }

    const sidebarOffset = state.sidebarOpen ? SIDEBAR_WIDTH : 0;

    return {

      x: 0,

      y: this.topChrome(),

      width: Math.max(0, width - sidebarOffset),

      height: Math.max(0, height - this.topChrome() - BOTTOM_CHROME),

    };

  }



  private onWindowResize(win: BrowserWindow) {

    this.layoutActiveView(win);

    const state = this.pw(win);

    if (state.resizeTimer) clearTimeout(state.resizeTimer);

    state.resizeTimer = setTimeout(() => {

      state.resizeTimer = null;

      const tabId = state.activeTabId;

      if (!tabId) return;

      const view = this.views.get(tabId);

      if (view && !view.webContents.isDestroyed()) {

        view.setBounds(view.getBounds());

      }

    }, 50);

  }



  private layoutActiveView(win: BrowserWindow) {

    const state = this.pw(win);

    if (!state.activeTabId) return;

    const view = this.views.get(state.activeTabId);

    if (!view || view.webContents.isDestroyed()) return;

    view.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });

    view.setBounds(this.bounds(win));

  }



  private securityForTab(tabId: string, url: string): Pick<TabUpdate, "secure" | "securityState" | "securityDetail"> {

    if (!url.startsWith("http")) {

      return { securityState: "unknown", securityDetail: "Not a web page" };

    }

    if (!url.startsWith("https://")) {

      return {

        secure: false,

        securityState: "insecure",

        securityDetail: "Connection is not encrypted",

      };

    }

    if (this.certErrors.has(tabId)) {

      return {

        secure: false,

        securityState: "warning",

        securityDetail: "Certificate error detected",

      };

    }

    return {

      secure: true,

      securityState: "secure",

      securityDetail: "Connection is secure",

    };

  }



  private emit(tabId: string, update: Partial<TabUpdate>) {

    this.winForTab(tabId)?.webContents.send("tab:updated", { tabId, ...update });

  }



  private wireEvents(tabId: string, view: BrowserView) {

    const wc = view.webContents;



    wc.setWindowOpenHandler(({ url }) => {

      const win = this.winForTab(tabId);

      if (this.onNewTab && url && win) {

        this.onNewTab(win, tabId, url);

      }

      return { action: "deny" };

    });

    wc.on("will-navigate", (event, url) => {
      if (!getSettings().https_only_mode) return;
      if (!url.startsWith("http://")) return;
      try {
        const secure = url.replace(/^http:\/\//i, "https://");
        event.preventDefault();
        wc.loadURL(secure);
      } catch {
        // keep original navigation
      }
    });



    wc.on("before-input-event", (_event, input) => {

      const action = matchShortcut(input);

      if (action) {

        _event.preventDefault();

        this.winForTab(tabId)?.webContents.send("shortcut:action", action);

      }

    });



    wireContextMenu(tabId, wc);



    wc.on("found-in-page", (_e, result) => {

      this.winForTab(tabId)?.webContents.send("find:result", {

        tabId,

        activeMatchOrdinal: result.activeMatchOrdinal,

        matches: result.matches,

        requestId: this.findRequestId,

      });

    });



    wc.on("certificate-error", (event, _url, _error, _certificate, callback) => {

      event.preventDefault();

      this.certErrors.add(tabId);

      this.emit(tabId, {

        ...this.securityForTab(tabId, wc.getURL()),

      });

      callback(true);

    });



    wc.on("did-start-loading", () => {

      this.emit(tabId, { isLoading: true, frozen: false });

    });



    wc.on("did-stop-loading", () => {

      const url = wc.getURL();

      this.emit(tabId, {

        isLoading: false,

        canGoBack: wc.navigationHistory.canGoBack(),

        canGoForward: wc.navigationHistory.canGoForward(),

        frozen: false,

        ...this.securityForTab(tabId, url),

      });



      const scrollY = this.pendingScroll.get(tabId);

      if (scrollY !== undefined && scrollY > 0) {

        this.pendingScroll.delete(tabId);

        void wc.executeJavaScript(`window.scrollTo(0, ${scrollY})`).catch(() => {});

      }



      if (!this.panicPreloadTabs.has(tabId)) {
        onPageLoaded(tabId);
      }

      if (!wc.getURL().startsWith("inix://") && getSettings().autofill_enabled) {
        void wc.executeJavaScript(getAutofillBootstrapScript()).catch(() => {});
      }

    });



    wc.on("page-title-updated", (_e, title) => {

      this.emit(tabId, { title });

    });



    wc.on("did-navigate", (_e, url) => {

      this.certErrors.delete(tabId);

      this.emit(tabId, {

        url,

        canGoBack: wc.navigationHistory.canGoBack(),

        canGoForward: wc.navigationHistory.canGoForward(),

        ...this.securityForTab(tabId, url),

      });

      if (!this.panicPreloadTabs.has(tabId)) {
        recordLightVisit(tabId, url, wc.getTitle());
      }

    });



    wc.on("did-navigate-in-page", (_e, url) => {

      this.emit(tabId, {

        url,

        canGoBack: wc.navigationHistory.canGoBack(),

        canGoForward: wc.navigationHistory.canGoForward(),

        ...this.securityForTab(tabId, url),

      });

    });



    wc.on("did-fail-load", (_e, errorCode, errorDescription) => {

      if (errorCode === -3) return;

      this.emit(tabId, { isLoading: false, error: `${errorDescription} (${errorCode})` });

    });

  }



  createTab(win: BrowserWindow, tabId: string, isPrivate = false) {

    if (this.views.has(tabId)) return;

    this.tabWindows.set(tabId, win);

    if (isPrivate) this.privateTabs.add(tabId);

    this.frozenTabs.delete(tabId);

    this.touchTab(tabId);

    const profileId = getWindowProfileId(win);

    const partition = isPrivate ? PRIVATE_PARTITION : getProfilePartition(profileId);

    const view = new BrowserView({

      webPreferences: {

        partition,

        preload: path.join(__dirname, "page-preload.js"),

        contextIsolation: true,

        nodeIntegration: false,

        sandbox: false,

      },

    });



    this.wireEvents(tabId, view);

    const zoom = this.zoomLevels.get(tabId) ?? getSettings().default_zoom_level;

    view.webContents.setZoomLevel(zoom);

    this.views.set(tabId, view);

  }



  destroyTab(tabId: string) {
    this.destroyView(tabId);
    this.tabWindows.delete(tabId);
    this.certErrors.delete(tabId);
    this.privateTabs.delete(tabId);
    this.frozenTabs.delete(tabId);
    this.frozenMeta.delete(tabId);
    this.lastActiveAt.delete(tabId);
    this.pendingScroll.delete(tabId);
    this.zoomLevels.delete(tabId);
    this.panicPreloadTabs.delete(tabId);
  }

  /** Tear down all page views so the process can exit for NSIS update install. */
  shutdownForUpdate(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.setBrowserView(null);
      } catch {
        // ignore
      }
    }
    for (const tabId of [...this.views.keys()]) {
      this.destroyTab(tabId);
    }
    this.perWindow.clear();
  }

  private destroyView(tabId: string) {
    const view = this.views.get(tabId);
    if (!view) return;

    const win = this.winForTab(tabId);
    if (win) {
      const state = this.pw(win);
      if (state.activeTabId === tabId) {
        win.setBrowserView(null);
        state.activeTabId = null;
      }
    }
    try {
      view.webContents.close();
    } catch {
      // view may already be destroyed
    }
    this.views.delete(tabId);
  }



  async freezeTab(tabId: string): Promise<boolean> {

    const win = this.winForTab(tabId);

    const state = win ? this.pw(win) : null;

    if (this.frozenTabs.has(tabId) || state?.activeTabId === tabId) return false;



    const captured = await captureTabState(tabId);

    if (!captured) return false;



    this.setPendingScroll(tabId, captured.scrollY);
    onTabFrozen(tabId, captured.scrollY, captured.url, captured.title);
    this.frozenMeta.set(tabId, {
      url: captured.url,
      title: captured.title,
      isPrivate: this.privateTabs.has(tabId),
    });
    this.destroyView(tabId);
    this.frozenTabs.add(tabId);

    this.emit(tabId, { url: captured.url, title: captured.title, frozen: true, isLoading: false });

    return true;

  }



  async unfreezeTab(win: BrowserWindow, tabId: string, url: string, isPrivate = false): Promise<void> {
    if (!this.frozenTabs.has(tabId)) return;
    const meta = this.frozenMeta.get(tabId);
    const loadUrl = url || meta?.url || "about:blank";
    const priv = isPrivate || meta?.isPrivate || false;
    this.frozenTabs.delete(tabId);
    this.frozenMeta.delete(tabId);
    onTabUnfrozen(tabId);
    this.createTab(win, tabId, priv);
    await this.navigate(win, tabId, loadUrl);
  }



  showTab(win: BrowserWindow, tabId: string) {

    if (this.frozenTabs.has(tabId)) {

      return;

    }



    const view = this.views.get(tabId);

    if (!view) return;



    const state = this.pw(win);

    win.setBrowserView(view);

    state.activeTabId = tabId;

    this.layoutActiveView(win);

    this.touchTab(tabId);

  }



  hide(win: BrowserWindow) {

    const state = this.pw(win);

    win.setBrowserView(null);

    state.activeTabId = null;

  }



  async loadInBackground(win: BrowserWindow, tabId: string, url: string, isPrivate = false): Promise<void> {
    if (url === "inix://library" || url === "inix://settings") {
      this.emit(tabId, { url, isLoading: false });
      return;
    }

    const resolved = resolveInixUrl(url);
    const loadUrl = resolved ?? url;
    const priv = isPrivate || this.privateTabs.has(tabId);

    if (this.frozenTabs.has(tabId)) {
      await this.unfreezeTab(win, tabId, url, priv);
      return;
    }

    if (!this.views.has(tabId)) this.createTab(win, tabId, priv);

    if (url.startsWith("inix://") && !resolved) {
      this.emit(tabId, { isLoading: false, error: "Inix Archive not available" });
      return;
    }

    this.emit(tabId, { url, isLoading: true });
    this.touchTab(tabId);

    try {
      await this.views.get(tabId)!.webContents.loadURL(loadUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit(tabId, { isLoading: false, error: msg });
    }
  }



  async navigate(win: BrowserWindow, tabId: string, url: string) {

    if (url === "inix://library" || url === "inix://settings") {

      this.emit(tabId, { url, isLoading: false });

      return;

    }



    const resolved = resolveInixUrl(url);

    const loadUrl = resolved ?? url;



    const isPrivate = this.privateTabs.has(tabId);



    if (this.frozenTabs.has(tabId)) {

      await this.unfreezeTab(win, tabId, url, isPrivate);

      return;

    }



    if (!this.views.has(tabId)) this.createTab(win, tabId, isPrivate);

    const view = this.views.get(tabId)!;



    const state = this.pw(win);

    win.setBrowserView(view);

    state.activeTabId = tabId;

    this.layoutActiveView(win);

    this.touchTab(tabId);



    if (url.startsWith("inix://") && !resolved) {

      this.emit(tabId, { isLoading: false, error: "Inix Archive not available" });

      return;

    }



    try {

      await view.webContents.loadURL(loadUrl);

    } catch (err) {

      const msg = err instanceof Error ? err.message : String(err);

      this.emit(tabId, { isLoading: false, error: msg });

    }

  }



  async ensureActive(win: BrowserWindow, tabId: string, url: string, isPrivate = false): Promise<void> {

    if (this.frozenTabs.has(tabId)) {

      await this.unfreezeTab(win, tabId, url, isPrivate);

    } else if (!this.views.has(tabId)) {

      this.createTab(win, tabId, isPrivate);

    }

    this.showTab(win, tabId);

    if (url && !url.startsWith("inix://library") && url !== "inix://settings") {

      const current = this.getTabUrl(tabId);

      if (!current || current === "about:blank") {

        await this.navigate(win, tabId, url);

      }

    }

  }



  goBack(tabId: string) {

    if (this.frozenTabs.has(tabId)) return;

    this.views.get(tabId)?.webContents.navigationHistory.goBack();

  }



  goForward(tabId: string) {

    if (this.frozenTabs.has(tabId)) return;

    this.views.get(tabId)?.webContents.navigationHistory.goForward();

  }



  reload(tabId: string) {

    if (this.frozenTabs.has(tabId)) return;

    this.views.get(tabId)?.webContents.reload();

  }



  findInPage(tabId: string, text: string, forward = true): number {

    const wc = this.views.get(tabId)?.webContents;

    if (!wc || !text.trim()) return 0;

    this.findRequestId = wc.findInPage(text, { forward, findNext: forward });

    return this.findRequestId;

  }



  stopFind(tabId: string): void {

    const wc = this.views.get(tabId)?.webContents;

    if (wc) wc.stopFindInPage("clearSelection");

  }



  zoomIn(tabId: string): number {

    const level = (this.zoomLevels.get(tabId) ?? 0) + 0.5;

    return this.setZoom(tabId, level);

  }



  zoomOut(tabId: string): number {

    const level = (this.zoomLevels.get(tabId) ?? 0) - 0.5;

    return this.setZoom(tabId, level);

  }



  zoomReset(tabId: string): number {

    return this.setZoom(tabId, 0);

  }



  getZoom(tabId: string): number {

    return this.zoomLevels.get(tabId) ?? 0;

  }



  private setZoom(tabId: string, level: number): number {

    const clamped = Math.max(-3, Math.min(5, level));

    this.zoomLevels.set(tabId, clamped);

    const wc = this.views.get(tabId)?.webContents;

    if (wc) wc.setZoomLevel(clamped);

    this.emit(tabId, { zoomLevel: clamped });

    return clamped;

  }



  toggleDevTools(tabId: string): void {

    const wc = this.views.get(tabId)?.webContents;

    if (!wc) return;

    if (wc.isDevToolsOpened()) wc.closeDevTools();

    else wc.openDevTools({ mode: "detach" });

  }



  print(tabId: string): void {

    this.views.get(tabId)?.webContents.print({ silent: false, printBackground: true });

  }

}



export function setupBrowsingSession() {

  initProfileSessions();

}



export const tabManager = new TabManager();


