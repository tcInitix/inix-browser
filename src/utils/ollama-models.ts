const EMBED_MODEL_RE = /embed|bge-|minilm|nomic-embed|mxbai-embed|snowflake-arctic-embed/i;

export function isEmbedModel(name: string): boolean {
  return EMBED_MODEL_RE.test(name);
}

export function isChatModel(name: string): boolean {
  return !isEmbedModel(name);
}

/** Ollama may return `model:tag` variants — treat as installed if base matches. */
export function isModelInstalled(modelName: string, installed: string[]): boolean {
  const base = modelName.split(":")[0];
  return installed.some(
    (m) => m === modelName || m.startsWith(`${modelName}:`) || m.startsWith(`${base}:`)
  );
}

export function sortModels(models: string[]): string[] {
  return [...models].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function chatModelsFromOllama(all: string[]): string[] {
  return sortModels(all.filter(isChatModel));
}

export function embedModelsFromOllama(all: string[]): string[] {
  return sortModels(all.filter(isEmbedModel));
}
