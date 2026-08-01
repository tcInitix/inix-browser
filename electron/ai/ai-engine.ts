import { getSettings } from "../storage/settings";
import { fetchOpenAiModels, probeOpenAiApi, streamOpenAiChat } from "./openai-client";

export type AiProvider = "local" | "api";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EngineStatus {
  connected: boolean;
  provider: AiProvider;
  models: string[];
  chatModel: string;
  embedModel: string;
  host: string;
  error?: string;
}

/** Unified local Ollama + custom OpenAI-compatible API client. */
export class AiEngine {
  constructor(private ollamaHost: string) {}

  private ollamaUrl(): string {
    return this.ollamaHost.replace(/\/$/, "");
  }

  async getStatus(): Promise<EngineStatus> {
    const settings = getSettings();

    if (settings.ai_provider === "api") {
      const hasConfig =
        settings.api_base_url.trim() && settings.api_key.trim() && settings.api_model.trim();

      if (!hasConfig) {
        return {
          connected: false,
          provider: "api",
          models: [],
          chatModel: settings.api_model,
          embedModel: settings.embed_model,
          host: settings.api_base_url,
          error: "Configure your API base URL, key, and model",
        };
      }

      const probe = await probeOpenAiApi(settings.api_base_url, settings.api_key);
      const models =
        probe.models.length > 0 ? probe.models : settings.api_model ? [settings.api_model] : [];

      return {
        connected: probe.ok,
        provider: "api",
        models,
        chatModel: settings.api_model,
        embedModel: settings.embed_model,
        host: settings.api_base_url,
        error: probe.ok ? undefined : probe.error,
      };
    }

    try {
      const res = await fetch(`${this.ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map((m) => m.name);
      return {
        connected: true,
        provider: "local",
        models,
        chatModel: settings.chat_model,
        embedModel: settings.embed_model,
        host: this.ollamaUrl(),
      };
    } catch (err) {
      return {
        connected: false,
        provider: "local",
        models: [],
        chatModel: settings.chat_model,
        embedModel: settings.embed_model,
        host: this.ollamaUrl(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Embeddings always use local Ollama for Inix semantic search. */
  async embed(text: string): Promise<number[]> {
    const settings = getSettings();
    const res = await fetch(`${this.ollamaUrl()}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.embed_model, prompt: text }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Embedding failed: HTTP ${res.status}`);
    const data = (await res.json()) as { embedding?: number[] };
    if (!data.embedding) throw new Error("No embedding returned");
    return data.embedding;
  }

  async *chatStream(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<string> {
    const settings = getSettings();

    if (settings.ai_provider === "api") {
      if (!settings.api_base_url.trim() || !settings.api_key.trim() || !settings.api_model.trim()) {
        throw new Error("Custom API is not configured — open Settings → Inix AI");
      }
      yield* streamOpenAiChat(
        settings.api_base_url,
        settings.api_key,
        settings.api_model,
        messages,
        onChunk
      );
      return;
    }

    const res = await fetch(`${this.ollamaUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.chat_model, messages, stream: true }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`Chat failed: HTTP ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string } };
          const content = parsed.message?.content;
          if (content) {
            onChunk?.(content);
            yield content;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}

let engine: AiEngine | null = null;

export function getAiEngine(): AiEngine {
  if (!engine) {
    const settings = getSettings();
    engine = new AiEngine(settings.engine_host);
  }
  return engine;
}

/** @deprecated use getAiEngine() */
export function getLocalEngine(): AiEngine {
  return getAiEngine();
}

export function resetAiEngine(): void {
  engine = null;
}

/** @deprecated use resetAiEngine() */
export function resetLocalEngine(): void {
  resetAiEngine();
}

export async function listApiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return fetchOpenAiModels(baseUrl, apiKey);
}
