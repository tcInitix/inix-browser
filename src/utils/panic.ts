import { normalizeUrl } from "../types";

export function parsePanicUrls(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function serializePanicUrls(urls: string[]): string {
  return JSON.stringify(urls.map((u) => u.trim()).filter(Boolean));
}

export function normalizePanicUrls(inputs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of inputs) {
    const url = normalizeUrl(input.trim());
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}
