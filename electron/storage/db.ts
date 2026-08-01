import initSqlJs, { type Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let db: Database | null = null;
let dbPath = "";

export async function initDatabase(): Promise<Database> {
  const wasmPath = path.join(
    app.getAppPath(),
    "node_modules",
    "sql.js",
    "dist",
    "sql-wasm.wasm"
  );
  const SQL = await initSqlJs({
    locateFile: () => (fs.existsSync(wasmPath) ? wasmPath : require.resolve("sql.js/dist/sql-wasm.wasm")),
  });

  dbPath = path.join(app.getPath("userData"), "inix.db");
  const legacyPath = path.join(app.getPath("userData"), "initix.db");
  if (!fs.existsSync(dbPath) && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, dbPath);
  }

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  runMigrations(db);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function saveDatabase(): void {
  if (!db || !dbPath) return;
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function runMigrations(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      captured_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      visited_at INTEGER NOT NULL,
      content_id INTEGER,
      FOREIGN KEY (content_id) REFERENCES page_content(id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      content_id INTEGER,
      created_at INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (content_id) REFERENCES page_content(id)
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      vector TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      visited_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_history_visited ON history(visited_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);
    CREATE INDEX IF NOT EXISTS idx_page_content_url ON page_content(url);
    CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);
  `);

  const defaults: Record<string, string> = {
    ai_provider: "local",
    engine_host: "http://127.0.0.1:11434",
    chat_model: "qwen2.5:7b",
    embed_model: "nomic-embed-text",
    api_base_url: "https://api.openai.com/v1",
    api_key: "",
    api_model: "gpt-4o-mini",
    capture_enabled: "true",
    archive_enabled: "true",
    tab_freeze_enabled: "true",
    tab_freeze_minutes: "30",
    history_mode: "standard",
    transient_purge_on_close: "true",
    transient_retention_hours: "24",
    homepage_url: "inix://newtab",
    new_tab_use_homepage: "false",
    private_mode_shortcut: "window",
    bookmark_bar_enabled: "false",
    panic_configured: "false",
    panic_urls: "[]",
    new_tab_quick_links:
      '[{"label":"DuckDuckGo","url":"https://duckduckgo.com"},{"label":"GitHub","url":"https://github.com"},{"label":"Reddit","url":"https://reddit.com"},{"label":"Hacker News","url":"https://news.ycombinator.com"}]',
  };

  for (const [key, value] of Object.entries(defaults)) {
    database.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }

  migrateLegacySettings(database);
  migrateBookmarksV2(database);
  migrateHistoryV2(database);
  migrateTier4(database);
  migrateBookmarkBar(database);
  migrateOnboarding(database);
}

function settingExists(database: Database, key: string): boolean {
  const stmt = database.prepare("SELECT 1 FROM settings WHERE key = ? LIMIT 1");
  stmt.bind([key]);
  const found = stmt.step();
  stmt.free();
  return found;
}

function migrateLegacySettings(database: Database): void {
  const hasOllama = settingExists(database, "ollama_host");
  const hasEngine = settingExists(database, "engine_host");

  if (hasOllama && hasEngine) {
    database.run("DELETE FROM settings WHERE key = 'ollama_host'");
  } else if (hasOllama) {
    database.run("UPDATE settings SET key = 'engine_host' WHERE key = 'ollama_host'");
  }
}

function columnExists(database: Database, table: string, column: string): boolean {
  const rows = database.exec(`PRAGMA table_info(${table})`);
  if (!rows[0]) return false;
  return rows[0].values.some((row) => row[1] === column);
}

function migrateBookmarksV2(database: Database): void {
  const bookmarkCols: Array<[string, string]> = [
    ["description", "TEXT NOT NULL DEFAULT ''"],
    ["og_title", "TEXT NOT NULL DEFAULT ''"],
    ["og_image", "TEXT NOT NULL DEFAULT ''"],
    ["meta_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["favicon_path", "TEXT NOT NULL DEFAULT ''"],
    ["snapshot_path", "TEXT NOT NULL DEFAULT ''"],
    ["snapshot_at", "INTEGER"],
    ["notes", "TEXT NOT NULL DEFAULT ''"],
  ];

  for (const [col, def] of bookmarkCols) {
    if (!columnExists(database, "bookmarks", col)) {
      database.run(`ALTER TABLE bookmarks ADD COLUMN ${col} ${def}`);
    }
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS bookmark_tags (
      bookmark_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (bookmark_id, tag),
      FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag);

    CREATE TABLE IF NOT EXISTS url_aliases (
      alias TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      viewport_x REAL NOT NULL DEFAULT 0,
      viewport_y REAL NOT NULL DEFAULT 0,
      zoom REAL NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_pins (
      workspace_id INTEGER NOT NULL,
      bookmark_id INTEGER NOT NULL,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 240,
      height REAL NOT NULL DEFAULT 120,
      z_index INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, bookmark_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
    );
  `);

  const wsCount = database.exec("SELECT COUNT(*) AS cnt FROM workspaces");
  const count = (wsCount[0]?.values[0]?.[0] as number) ?? 0;
  if (count === 0) {
    const now = Date.now();
    database.run(
      "INSERT INTO workspaces (name, viewport_x, viewport_y, zoom, created_at, updated_at) VALUES (?, 0, 0, 1, ?, ?)",
      ["Home", now, now]
    );
  }

  saveDatabase();
}

function migrateHistoryV2(database: Database): void {
  if (!columnExists(database, "history", "tier")) {
    database.run("ALTER TABLE history ADD COLUMN tier TEXT NOT NULL DEFAULT 'standard'");
  }
  if (!columnExists(database, "history", "session_id")) {
    database.run("ALTER TABLE history ADD COLUMN session_id TEXT");
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS vault_config (
      id INTEGER PRIMARY KEY,
      salt TEXT NOT NULL,
      iterations INTEGER NOT NULL,
      verifier TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  try {
    database.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
        history_id UNINDEXED,
        title,
        url,
        body
      );
    `);
  } catch {
    // FTS5 may be unavailable in this sql.js build
  }

  saveDatabase();
}

function migrateBookmarkBar(database: Database): void {
  if (!columnExists(database, "bookmarks", "on_bookmark_bar")) {
    database.run("ALTER TABLE bookmarks ADD COLUMN on_bookmark_bar INTEGER NOT NULL DEFAULT 0");
  }
  saveDatabase();
}

function migrateOnboarding(database: Database): void {
  if (settingExists(database, "onboarding_completed")) return;

  const historyRows = database.exec("SELECT COUNT(*) AS cnt FROM history");
  const bookmarkRows = database.exec("SELECT COUNT(*) AS cnt FROM bookmarks");
  const historyCount = (historyRows[0]?.values[0]?.[0] as number) ?? 0;
  const bookmarkCount = (bookmarkRows[0]?.values[0]?.[0] as number) ?? 0;
  const completed = historyCount > 0 || bookmarkCount > 0 ? "true" : "false";

  database.run("INSERT INTO settings (key, value) VALUES (?, ?)", [
    "onboarding_completed",
    completed,
  ]);
  saveDatabase();
}

function migrateTier4(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS vault_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT NOT NULL,
      username_hint TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vault_credentials_origin ON vault_credentials(origin);

    CREATE TABLE IF NOT EXISTS vault_autofill_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at INTEGER NOT NULL
    );
  `);

  const profileCount = database.exec("SELECT COUNT(*) AS cnt FROM browser_profiles");
  const cnt = (profileCount[0]?.values[0]?.[0] as number) ?? 0;
  if (cnt === 0) {
    database.run(
      "INSERT INTO browser_profiles (id, name, color, created_at) VALUES (?, ?, ?, ?)",
      ["default", "Default", "#6366f1", Date.now()]
    );
  }

  saveDatabase();
}

export function runQuery<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

export function runExec(sql: string, params: (string | number | null)[] = []): void {
  getDb().run(sql, params);
}

export function lastInsertId(): number {
  const rows = runQuery<{ id: number }>("SELECT last_insert_rowid() AS id");
  return rows[0]?.id ?? 0;
}
