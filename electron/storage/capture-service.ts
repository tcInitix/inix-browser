import {
  shouldCapture,
  wasRecentlyCaptured,
  savePageContent,
  linkCaptureToRecentVisit,
  getDefaultHistoryTier,
} from "./history";
import { isCaptureEnabled, EXTRACT_PAGE_SCRIPT, extractPageInMain } from "./page-extractor";
import { queueEmbedding } from "./vector-index";
import { tabManager } from "../tab-manager";
import { isVaultUnlocked, saveVaultEntry } from "./vault";

export async function capturePage(tabId: string): Promise<void> {
  if (!isCaptureEnabled()) return;
  if (tabManager.isHistorySuppressed(tabId)) return;
  if (tabManager.isPrivate(tabId)) return;

  const wc = tabManager.getWebContents(tabId);
  if (!wc || wc.isDestroyed()) return;

  const url = wc.getURL();
  if (!shouldCapture(url) || wasRecentlyCaptured(url)) return;

  try {
    let title = wc.getTitle();
    let text = "";

    try {
      const extracted = (await wc.executeJavaScript(EXTRACT_PAGE_SCRIPT)) as {
        title: string;
        text: string;
      };
      title = extracted.title || title;
      text = extracted.text;
    } catch {
      const html = await wc.executeJavaScript("document.documentElement.outerHTML");
      const fallback = extractPageInMain(html as string, url);
      title = fallback.title || title;
      text = fallback.text;
    }

    if (!text.trim()) return;

    const tier = getDefaultHistoryTier(false);

    if (tier === "vaulted") {
      if (!isVaultUnlocked()) return;
      saveVaultEntry({ url, title, visited_at: Date.now(), text });
      return;
    }

    const contentId = savePageContent(url, title, text);
    const historyId = linkCaptureToRecentVisit(url, contentId, tier);
    if (tier === "standard") {
      queueEmbedding(contentId, "history", historyId, url, title, Date.now(), text);
    }
  } catch (err) {
    console.error("[capture] failed:", err);
  }
}

export function onPageLoaded(tabId: string): void {
  void capturePage(tabId);
}
