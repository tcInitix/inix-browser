import { ipcMain, type BrowserWindow } from "electron";
import { getAiEngine, type ChatMessage } from "./ai-engine";
import { buildContextPrompt, getPageContext, getSelection, canUseTabContent } from "./context";
import { buildFullSystemPrompt, buildSystemPrompt } from "./prompts";
import { gatherWebContextSafe, extractUrls } from "./web-context";
import { isCasualChatMessage, isAboutAiMessage, shouldSearchWebForMessage } from "./casual-chat";

async function streamChat(
  win: BrowserWindow | null,
  messages: ChatMessage[]
): Promise<{ ok: boolean; content?: string; error?: string }> {
  const engine = getAiEngine();
  let fullResponse = "";
  try {
    for await (const chunk of engine.chatStream(messages, (c) => {
      win?.webContents.send("ai:stream-chunk", c);
    })) {
      fullResponse += chunk;
    }
    win?.webContents.send("ai:stream-done", fullResponse);
    return { ok: true, content: fullResponse };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    win?.webContents.send("ai:stream-error", msg);
    return { ok: false, error: msg };
  }
}

function withSystemPrompt(messages: ChatMessage[], systemContent: string): ChatMessage[] {
  const withoutSystem = messages.filter((m) => m.role !== "system");
  return [{ role: "system", content: systemContent }, ...withoutSystem];
}

function lastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

export function registerAiHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("ai:status", async () => getAiEngine().getStatus());

  ipcMain.handle(
    "ai:chat",
    async (
      _e,
      tabId: string,
      messages: ChatMessage[],
      usePageContext: boolean,
      useWebSearch = false
    ) => {
      const win = getWindow();
      let webContext: string | undefined;
      let webNote: string | undefined;

      if (useWebSearch) {
        const userMsg = lastUserMessage(messages);
        const urls = extractUrls(userMsg);

        if (shouldSearchWebForMessage(userMsg, urls.length > 0)) {
          win?.webContents.send("ai:web-search-start");
          const web = await gatherWebContextSafe(userMsg);
          win?.webContents.send("ai:web-search-done", web.status, web.detail ?? "");
          if (web.context) {
            webContext = web.context;
          } else if (web.status === "empty") {
            webNote = "Web search returned no usable results.";
          } else if (web.status === "error") {
            webNote = `Web search failed: ${web.detail ?? "unknown error"}`;
          }
        }
      }

      const userMsg = lastUserMessage(messages);

      let pageContext: string | undefined;
      if (usePageContext && tabId) {
        const ctx = await getPageContext(tabId);
        if (ctx?.text) {
          pageContext = buildContextPrompt(ctx);
        }
      }

      let systemContent = buildFullSystemPrompt({
        pageContext,
        webContext,
        casualChat: isCasualChatMessage(userMsg),
        aboutAi: isAboutAiMessage(userMsg),
      });
      if (webNote && !webContext) {
        systemContent += `\n\n[${webNote} Answer from general knowledge if helpful, but say if you're uncertain about current facts.]`;
      }

      return streamChat(win, withSystemPrompt(messages, systemContent));
    }
  );

  ipcMain.handle("ai:summarize", async (_e, tabId: string) => {
    if (!canUseTabContent(tabId)) {
      return { ok: false, error: "Open a web page first — AI can't read the new tab page." };
    }
    const ctx = await getPageContext(tabId);
    if (!ctx?.text) return { ok: false, error: "No page content available. Try reloading the page." };
    return streamChat(getWindow(), [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Summarize this page concisely in 3-5 bullet points:\n\n${buildContextPrompt(ctx)}`,
      },
    ]);
  });

  ipcMain.handle("ai:explain-selection", async (_e, tabId: string) => {
    if (!canUseTabContent(tabId)) {
      return { ok: false, error: "Open a web page first, then select text to explain." };
    }
    const selection = await getSelection(tabId);
    if (!selection.trim()) {
      return { ok: false, error: "No text selected — highlight text on the page first." };
    }
    const ctx = await getPageContext(tabId);
    return streamChat(getWindow(), [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Explain this selected text clearly:\n\n"${selection}"\n\nFrom page: ${ctx?.title ?? "unknown"}`,
      },
    ]);
  });
}
