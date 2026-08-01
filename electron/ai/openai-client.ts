type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function fetchOpenAiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  return (data.data ?? []).map((m) => m.id).sort((a, b) => a.localeCompare(b));
}

export async function probeOpenAiApi(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  if (!baseUrl.trim() || !apiKey.trim()) {
    return { ok: false, models: [], error: "Base URL and API key are required" };
  }
  try {
    const models = await fetchOpenAiModels(baseUrl, apiKey);
    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function* streamOpenAiChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void
): AsyncGenerator<string> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API chat failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 240)}` : ""}`
    );
  }
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
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          onChunk?.(content);
          yield content;
        }
      } catch {
        // skip malformed SSE chunks
      }
    }
  }
}
