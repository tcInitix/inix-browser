import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, EngineStatus } from "../inix.d";
import { AiThinkingIndicator } from "./AiThinkingIndicator";
import { AiMessageContent } from "./AiMessageContent";
import { Switch } from "./Switch";
import { shouldOfferLinksForTurn } from "../utils/extractLinks";

const handledInjectIds = new Set<string>();

export interface AiInjectRequest {
  id: string;
  tabId: string;
  text?: string;
}

interface AISidebarProps {
  tabId: string;
  open: boolean;
  hasPage: boolean;
  onClose: () => void;
  onOpenLink: (url: string) => void;
  injectRequest?: AiInjectRequest | null;
  onInjectConsumed?: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export function AISidebar({
  tabId,
  open,
  hasPage,
  onClose,
  onOpenLink,
  injectRequest,
  onInjectConsumed,
}: AISidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [webSearchStatus, setWebSearchStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissedLinks, setDismissedLinks] = useState<Set<string>>(() => new Set());
  const streamRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasOpenRef = useRef(false);
  const [pageReadable, setPageReadable] = useState(hasPage);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) {
      setPageReadable(hasPage);
      return;
    }
    void window.inix?.browser.canUseTabContent(tabId).then(setPageReadable);
  }, [open, tabId, hasPage]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const dismissLink = useCallback((messageId: string, url: string) => {
    setDismissedLinks((prev) => new Set(prev).add(`${messageId}:${url}`));
  }, []);

  const finishStreaming = useCallback((content: string) => {
    streamRef.current = "";
    setLoading(false);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.streaming) {
        return [...prev.slice(0, -1), { ...last, content, streaming: false }];
      }
      return prev;
    });
  }, []);

  const failStreaming = useCallback((error: string) => {
    streamRef.current = "";
    setLoading(false);
    setMessages((prev) => {
      const withoutStreaming = prev.filter((m) => !m.streaming);
      return [
        ...withoutStreaming,
        { id: crypto.randomUUID(), role: "assistant", content: error },
      ];
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    window.inix?.ai.getStatus().then(setStatus);
    const interval = setInterval(() => {
      window.inix?.ai.getStatus().then(setStatus);
    }, 10000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    const ai = window.inix?.ai;
    if (!ai) return;

    const unsubChunk = ai.onStreamChunk((chunk) => {
      streamRef.current += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, content: streamRef.current }];
        }
        return prev;
      });
    });

    const unsubDone = ai.onStreamDone((content) => finishStreaming(content));
    const unsubError = ai.onStreamError((err) => failStreaming(`Error: ${err}`));

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
    };
  }, [finishStreaming, failStreaming]);

  useEffect(() => {
    const ai = window.inix?.ai;
    if (!ai) return;
    const unsubStart = ai.onWebSearchStart?.(() => setWebSearchStatus("Searching the web…"));
    const unsubDone = ai.onWebSearchDone?.((status, detail) => {
      if (status === "ok") setWebSearchStatus("Web results loaded");
      else if (status === "empty") setWebSearchStatus("No web results found");
      else setWebSearchStatus(detail ? `Web search: ${detail}` : "Web search failed");
      setTimeout(() => setWebSearchStatus(null), 2500);
    });
    return () => {
      unsubStart?.();
      unsubDone?.();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    const streaming = messages.some((m) => m.streaming);

    const frame = requestAnimationFrame(() => {
      scrollChatToBottom(justOpened || streaming ? "auto" : "smooth");
    });
    return () => cancelAnimationFrame(frame);
  }, [open, messages, scrollChatToBottom]);

  const sendMessages = useCallback(
    async (
      newMessages: Message[],
      opts?: { usePageContext?: boolean; tabId?: string }
    ) => {
      const ai = window.inix?.ai;
      if (!ai || loading) return;
      const chatTabId = opts?.tabId ?? tabId;
      setLoading(true);
      streamRef.current = "";
      setMessages((prev) => [
        ...prev,
        ...newMessages,
        { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true },
      ]);

      const chatMsgs: ChatMessage[] = [
        ...messages
          .filter((m) => !m.streaming && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content })),
        ...newMessages.map((m) => ({ role: m.role, content: m.content })),
      ];

      try {
        const result = await ai.chat(
          chatTabId,
          chatMsgs,
          opts?.usePageContext ?? false,
          useWebSearch
        );
        if (result && !result.ok) {
          failStreaming(result.error ?? "Chat failed");
        }
      } catch {
        failStreaming("Chat request failed");
      }
    },
    [tabId, useWebSearch, loading, failStreaming, messages]
  );

  const handleSend = () => {
    if (!input.trim() || loading) return;
    const msg: Message = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    setInput("");
    void sendMessages([msg]);
    focusInput();
  };

  const runPageAction = async (
    userLabel: string,
    action: () => Promise<{ ok: boolean; content?: string; error?: string } | undefined>,
    targetTabId = tabId
  ) => {
    if (loading) return;
    const readable = await window.inix?.browser.canUseTabContent(targetTabId);
    if (!readable) {
      failStreaming("Open a web page first — the new tab page has nothing to analyze.");
      return;
    }
    setLoading(true);
    streamRef.current = "";
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: userLabel },
      { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true },
    ]);
    try {
      const result = await action();
      if (!result) {
        failStreaming("AI request failed");
      } else if (!result.ok) {
        failStreaming(result.error ?? "Request failed");
      }
    } catch {
      failStreaming("AI request failed");
    }
  };

  useEffect(() => {
    if (!open || !injectRequest) return;
    if (handledInjectIds.has(injectRequest.id)) return;
    handledInjectIds.add(injectRequest.id);
    if (handledInjectIds.size > 32) {
      const oldest = handledInjectIds.values().next().value;
      if (oldest) handledInjectIds.delete(oldest);
    }

    const targetTabId = injectRequest.tabId;

    const run = async () => {
      try {
        if (!injectRequest.text) {
          await runPageAction(
            "Summarize this page",
            () => window.inix!.ai.summarize(targetTabId),
            targetTabId
          );
        } else if (injectRequest.text.startsWith("Tell me about this link:")) {
          await sendMessages(
            [{ id: crypto.randomUUID(), role: "user", content: injectRequest.text }],
            { usePageContext: true, tabId: targetTabId }
          );
        } else {
          await sendMessages(
            [
              {
                id: crypto.randomUUID(),
                role: "user",
                content: `Please help me with this from the page:\n\n"${injectRequest.text}"`,
              },
            ],
            { usePageContext: true, tabId: targetTabId }
          );
        }
      } finally {
        onInjectConsumed?.();
      }
    };

    void run();
  }, [injectRequest, open, onInjectConsumed, runPageAction, sendMessages]);

  if (!open) return null;

  return (
    <aside className="ai-sidebar">
      <header className="ai-sidebar-header">
        <div>
          <h2>Inix AI</h2>
          <span className={`ai-status ${status?.connected ? "ai-status-on" : "ai-status-off"}`}>
            {status?.connected
              ? status.provider === "api"
                ? "API ready"
                : "Local engine ready"
              : status?.provider === "api"
                ? "API not configured"
                : "Local engine offline"}
          </span>
        </div>
        <button className="ai-close" onClick={onClose} aria-label="Close AI sidebar">
          ✕
        </button>
      </header>

      {!status?.connected && (
        <div className="ai-offline-banner">
          {status?.provider === "api" ? (
            <>
              Custom API is not ready. Open <strong>Settings → Inix AI</strong> to add your API base URL, key, and
              model.
            </>
          ) : (
            <>
              Inix Local Engine is offline. Open <strong>Settings → Inix AI</strong> to configure Ollama, or switch to
              a custom API.
            </>
          )}
        </div>
      )}

      {!pageReadable && (
        <div className="ai-offline-banner">
          Navigate to a website to summarize or explain page content. You can still chat here.
        </div>
      )}

      <div className="ai-actions">
        <button
          onClick={() => runPageAction("Summarize this page", () => window.inix!.ai.summarize(tabId))}
          disabled={loading || !status?.connected || !pageReadable}
        >
          Summarize page
        </button>
        <button
          onClick={() =>
            runPageAction("Explain selected text", () => window.inix!.ai.explainSelection(tabId))
          }
          disabled={loading || !status?.connected || !pageReadable}
        >
          Explain selection
        </button>
      </div>

      <Switch
        className="ai-context-toggle"
        checked={useWebSearch}
        onChange={setUseWebSearch}
        label="Search the web for factual questions"
      />
      <p className="ai-context-hint">Leave off for casual chat. When on, search only runs for questions and lookups — not greetings.</p>

      {webSearchStatus && (
        <div className="ai-web-status">
          <AiThinkingIndicator label={webSearchStatus} compact />
        </div>
      )}

      <div className="ai-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="ai-empty">
            {pageReadable
              ? "Ask about this page, search the web, or just chat — processing stays local except web fetches."
              : "Ask anything — turn on web search when you need live facts."}
          </p>
        )}
        {messages.map((m, index) => {
          const lastUserMessage = [...messages.slice(0, index)].reverse().find((msg) => msg.role === "user")
            ?.content;

          return (
          <div
            key={m.id}
            className={`ai-msg ai-msg-${m.role}${m.streaming && !m.content.trim() ? " ai-msg-pending" : ""}`}
          >
            <span className="ai-msg-role">{m.role === "user" ? "You" : "AI"}</span>
            {m.streaming && !m.content.trim() ? (
              <AiThinkingIndicator label="Thinking…" />
            ) : m.role === "assistant" ? (
              <AiMessageContent
                content={m.content}
                streaming={m.streaming}
                messageId={m.id}
                offerLinks={shouldOfferLinksForTurn(lastUserMessage)}
                dismissedLinks={
                  new Set(
                    [...dismissedLinks]
                      .filter((k) => k.startsWith(`${m.id}:`))
                      .map((k) => k.slice(m.id.length + 1))
                  )
                }
                onDismissLink={dismissLink}
                onOpenLink={(url) => {
                  dismissLink(m.id, url);
                  void onOpenLink(url);
                }}
              />
            ) : (
              <p>{m.content}</p>
            )}
          </div>
          );
        })}
      </div>

      <footer className="ai-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={pageReadable ? "Ask about this page…" : "Ask anything…"}
          rows={2}
          disabled={!status?.connected}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={loading || !input.trim() || !status?.connected}
        >
          {loading ? (
            <span className="ai-send-loading">
              <span className="ai-thinking-ring ai-thinking-ring-sm" aria-hidden="true" />
              Working…
            </span>
          ) : (
            "Send"
          )}
        </button>
      </footer>
    </aside>
  );
}
