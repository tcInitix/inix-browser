import { EXTRACT_PAGE_SCRIPT } from "../storage/page-extractor";
import { tabManager } from "../tab-manager";

const MAX_CONTEXT_CHARS = 8000;
const SCRIPT_TIMEOUT_MS = 8000;

export interface PageContext {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

function isBrowsableUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function ensureTabReady(tabId: string): Promise<void> {
  if (tabManager.isFrozen(tabId)) {
    const win = tabManager.getWindowForTab(tabId);
    const url = tabManager.getTabUrl(tabId);
    if (win) await tabManager.ensureActive(win, tabId, url, tabManager.isPrivate(tabId));
  }
}

async function runInPage<T>(tabId: string, script: string): Promise<T | null> {
  await ensureTabReady(tabId);
  const wc = tabManager.getWebContents(tabId);
  if (!wc || wc.isDestroyed() || wc.isLoading()) return null;

  const url = wc.getURL();
  if (!isBrowsableUrl(url)) return null;

  try {
    return await Promise.race([
      wc.executeJavaScript(script) as Promise<T>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Page script timed out")), SCRIPT_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return null;
  }
}

export async function getPageContext(tabId: string): Promise<PageContext | null> {
  const result = await runInPage<{ url: string; title: string; text: string }>(
    tabId,
    EXTRACT_PAGE_SCRIPT
  );
  if (!result?.text?.trim()) return null;

  const truncated = result.text.length > MAX_CONTEXT_CHARS;
  return {
    url: result.url,
    title: result.title,
    text: truncated ? result.text.slice(0, MAX_CONTEXT_CHARS) : result.text,
    truncated,
  };
}

export async function getSelection(tabId: string): Promise<string> {
  const result = await runInPage<string>(tabId, `window.getSelection()?.toString() || ""`);
  return result ?? "";
}

export function buildContextPrompt(context: PageContext): string {
  let prompt = `Page URL: ${context.url}\nPage Title: ${context.title}\n\nPage Content:\n${context.text}`;
  if (context.truncated) prompt += "\n\n[Content truncated to 8000 characters]";
  return prompt;
}

export function canUseTabContent(tabId: string): boolean {
  if (tabManager.isFrozen(tabId)) return true;
  return isBrowsableUrl(tabManager.getTabUrl(tabId));
}