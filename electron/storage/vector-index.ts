import { runQuery, runExec, saveDatabase } from "./db";
import { getAiEngine } from "../ai/ai-engine";

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

const embedQueue: Array<{
  contentId: number;
  sourceType: string;
  sourceId: number;
  url: string;
  title: string;
  visitedAt: number;
  text: string;
}> = [];

let processing = false;

function chunkText(text: string): string[] {
  if (!text.trim()) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function parseVector(raw: string): number[] {
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (embedQueue.length > 0) {
    const job = embedQueue.shift()!;
    try {
      const engine = getAiEngine();
      const chunks = chunkText(job.text);

      runExec(
        "DELETE FROM embeddings WHERE source_type = ? AND source_id = ?",
        [job.sourceType, job.sourceId]
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vector = await engine.embed(chunk);
        runExec(
          `INSERT INTO embeddings (source_type, source_id, chunk_index, chunk_text, vector, url, title, visited_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            job.sourceType,
            job.sourceId,
            i,
            chunk.slice(0, 500),
            JSON.stringify(vector),
            job.url,
            job.title,
            job.visitedAt,
          ]
        );
      }
      saveDatabase();
    } catch (err) {
      console.error("[vector-index] embed failed:", err);
    }
  }

  processing = false;
}

export function queueEmbedding(
  contentId: number,
  sourceType: "history" | "bookmark",
  sourceId: number,
  url: string,
  title: string,
  visitedAt: number,
  text: string
): void {
  embedQueue.push({ contentId, sourceType, sourceId, url, title, visitedAt, text });
  void processQueue();
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  visited_at: number;
  score: number;
}

export async function semanticSearch(query: string, limit = 10): Promise<SearchResult[]> {
  const engine = getAiEngine();
  const queryVector = await engine.embed(query);

  const rows = runQuery<{
    chunk_text: string;
    vector: string;
    url: string;
    title: string;
    visited_at: number;
  }>("SELECT chunk_text, vector, url, title, visited_at FROM embeddings");

  const scored = rows
    .map((row) => ({
      url: row.url,
      title: row.title,
      snippet: row.chunk_text.slice(0, 200),
      visited_at: row.visited_at,
      score: cosineSimilarity(queryVector, parseVector(row.vector)),
    }))
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const item of scored) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

export function rebuildIndex(): void {
  runExec("DELETE FROM embeddings");
  saveDatabase();

  const pages = runQuery<{
    id: number;
    url: string;
    title: string;
    text: string;
    captured_at: number;
  }>("SELECT id, url, title, text, captured_at FROM page_content");

  for (const page of pages) {
    queueEmbedding(page.id, "history", page.id, page.url, page.title, page.captured_at, page.text);
  }
}
