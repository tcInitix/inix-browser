import initSqlJs, { type Database, type SqlValue } from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let sqlModule: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!sqlModule) {
    const wasmPath = path.join(
      app.getAppPath(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm.wasm"
    );
    sqlModule = await initSqlJs({
      locateFile: () =>
        fs.existsSync(wasmPath) ? wasmPath : require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  }
  return sqlModule;
}

export async function queryExternalSqlite<T extends Record<string, SqlValue>>(
  filePath: string,
  sql: string,
  params: SqlValue[] = []
): Promise<T[]> {
  const SQL = await getSql();
  const db: Database = new SQL.Database(fs.readFileSync(filePath));
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  } finally {
    db.close();
  }
}
