import { Menu, clipboard, type BrowserWindow, type ContextMenuParams } from "electron";
import { tabManager } from "./tab-manager";

type ContextAction =
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "copy-link"; url: string }
  | { type: "open-link-new-tab"; url: string; parentTabId: string }
  | { type: "copy-image"; srcURL: string }
  | { type: "save-image"; srcURL: string }
  | { type: "search-text"; text: string }
  | { type: "send-to-ai"; tabId: string; text?: string }
  | { type: "inspect" };

let getWindow: (() => BrowserWindow | null) | null = null;

export function initContextMenus(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter;
}

function findTabIdForWebContents(targetId: number): string | null {
  for (const tabId of tabManager.getAllTabIds()) {
    const wc = tabManager.getWebContents(tabId);
    if (wc && wc.id === targetId) return tabId;
  }
  return tabManager.getActiveTabId();
}

export function showContextMenu(tabId: string, params: ContextMenuParams) {
  const wc = tabManager.getWebContents(tabId);
  if (!wc) return;

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (params.linkURL) {
    template.push(
      {
        label: "Open link in new tab",
        click: () => {
          getWindow?.()?.webContents.send("context:action", {
            type: "open-link-new-tab",
            url: params.linkURL,
            parentTabId: tabId,
          } satisfies ContextAction);
        },
      },
      {
        label: "Copy link address",
        click: () => clipboard.writeText(params.linkURL),
      },
      { type: "separator" }
    );
  }

  if (params.mediaType === "image" && params.srcURL) {
    template.push(
      {
        label: "Copy image address",
        click: () => clipboard.writeText(params.srcURL),
      },
      {
        label: "Open image in new tab",
        click: () => {
          getWindow?.()?.webContents.send("context:action", {
            type: "open-link-new-tab",
            url: params.srcURL,
            parentTabId: tabId,
          } satisfies ContextAction);
        },
      },
      { type: "separator" }
    );
  }

  if (params.selectionText) {
    template.push(
      {
        label: "Copy",
        role: "copy",
      },
      {
        label: `Search for "${params.selectionText.slice(0, 40)}${params.selectionText.length > 40 ? "…" : ""}"`,
        click: () => {
          getWindow?.()?.webContents.send("context:action", {
            type: "search-text",
            text: params.selectionText,
          } satisfies ContextAction);
        },
      },
      { type: "separator" }
    );
  }

  template.push(
    {
      label: "Send to Inix AI",
      click: () => {
        const text = params.selectionText?.trim()
          ? params.selectionText.trim()
          : params.linkURL
            ? `Tell me about this link: ${params.linkURL}`
            : undefined;
        getWindow?.()?.webContents.send("context:action", {
          type: "send-to-ai",
          tabId,
          text,
        } satisfies ContextAction);
      },
    },
    { type: "separator" }
  );

  if (params.isEditable) {
    template.push(
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
      { type: "separator" }
    );
  }

  template.push(
    {
      label: "Back",
      enabled: wc.navigationHistory.canGoBack(),
      click: () => wc.navigationHistory.goBack(),
    },
    {
      label: "Forward",
      enabled: wc.navigationHistory.canGoForward(),
      click: () => wc.navigationHistory.goForward(),
    },
    {
      label: "Reload",
      click: () => wc.reload(),
    },
    { type: "separator" },
    {
      label: "Inspect element",
      click: () => {
        wc.inspectElement(params.x, params.y);
        if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: "detach" });
      },
    }
  );

  Menu.buildFromTemplate(template).popup({
    window: getWindow?.() ?? undefined,
  });
}

export function wireContextMenu(tabId: string, wc: Electron.WebContents) {
  wc.on("context-menu", (_event, params) => {
    const resolvedTabId = findTabIdForWebContents(wc.id) ?? tabId;
    showContextMenu(resolvedTabId, params);
  });
}
