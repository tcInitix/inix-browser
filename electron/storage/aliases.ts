import { runQuery, runExec, saveDatabase } from "./db";

export interface UrlAlias {
  alias: string;
  url: string;
  title: string;
  created_at: number;
}

export function listAliases(): UrlAlias[] {
  return runQuery<UrlAlias>("SELECT * FROM url_aliases ORDER BY alias ASC");
}

export function setAlias(alias: string, url: string, title = ""): UrlAlias {
  const key = alias.trim().toLowerCase();
  const now = Date.now();
  runExec(
    "INSERT OR REPLACE INTO url_aliases (alias, url, title, created_at) VALUES (?, ?, ?, ?)",
    [key, url, title, now]
  );
  saveDatabase();
  return runQuery<UrlAlias>("SELECT * FROM url_aliases WHERE alias = ?", [key])[0]!;
}

export function removeAlias(alias: string): void {
  runExec("DELETE FROM url_aliases WHERE alias = ?", [alias.trim().toLowerCase()]);
  saveDatabase();
}

export function resolveAlias(input: string): UrlAlias | null {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  const rows = runQuery<UrlAlias>("SELECT * FROM url_aliases WHERE alias = ?", [key]);
  return rows[0] ?? null;
}

export function seedDefaultAliases(engineHost: string): void {
  if (!resolveAlias("localai")) {
    setAlias("localai", engineHost, "Inix Local Engine");
  }
}

export function aliasesAsMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of listAliases()) map[a.alias] = a.url;
  return map;
}
