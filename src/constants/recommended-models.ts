/** Recommended Ollama chat models — keep in sync with electron/ai/prompts.ts */
export const RECOMMENDED_CHAT_MODELS = [
  { name: "qwen3:8b", note: "Best balance on 8GB — newer knowledge than Llama 3.2" },
  { name: "qwen2.5:7b", note: "Solid all-rounder, widely available" },
  { name: "llama3.1:8b", note: "Mature ecosystem, lighter on VRAM" },
  { name: "qwen3.6:27b", note: "High quality if you have 16–24GB VRAM" },
  { name: "llama3.3:70b", note: "Top quality, needs ~40GB VRAM" },
] as const;

export const SUGGESTED_CHAT_MODEL = RECOMMENDED_CHAT_MODELS[0].name;
