import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SQLITE_SIDEcars = ["", "-wal", "-shm", "-journal"] as const;

function escapePsSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

/** Copy a file that may be locked by Chrome/Edge using shared read access on Windows. */
function copyFileForRead(src: string, dest: string): void {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    fs.copyFileSync(src, dest);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (process.platform !== "win32" || (code !== "EBUSY" && code !== "EPERM")) {
      throw err;
    }
  }

  if (process.platform === "win32") {
    const script = `
$src = '${escapePsSingleQuoted(src)}'
$dest = '${escapePsSingleQuoted(dest)}'
$dir = [System.IO.Path]::GetDirectoryName($dest)
if (-not [System.IO.Directory]::Exists($dir)) {
  [void][System.IO.Directory]::CreateDirectory($dir)
}
$fs = $null
try {
  $fs = [System.IO.File]::Open(
    $src,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
  )
  $len = $fs.Length
  $bytes = New-Object byte[] $len
  [void]$fs.Read($bytes, 0, $len)
  [System.IO.File]::WriteAllBytes($dest, $bytes)
} finally {
  if ($null -ne $fs) { $fs.Close() }
}
`;
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "pipe",
      timeout: 20_000,
    });
    return;
  }

  fs.copyFileSync(src, dest);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyFileForReadWithRetry(src: string, dest: string, attempts = 4): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      copyFileForRead(src, dest);
      return;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(150 * (i + 1));
    }
  }
  throw lastError;
}

export interface SqliteSnapshot {
  dbPath: string;
  cleanup: () => void;
}

/** Snapshot a Chromium SQLite DB and its WAL sidecars for offline reading. */
export async function snapshotChromiumSqlite(dbPath: string, label = "inix-sqlite"): Promise<SqliteSnapshot> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  const baseName = path.basename(dbPath);
  const sourceDir = path.dirname(dbPath);
  let copiedMain = false;

  for (const suffix of SQLITE_SIDEcars) {
    const src = path.join(sourceDir, `${baseName}${suffix}`);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(dir, `${baseName}${suffix}`);
    await copyFileForReadWithRetry(src, dest);
    if (suffix === "") copiedMain = true;
  }

  if (!copiedMain) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`Could not read database: ${dbPath}`);
  }

  return {
    dbPath: path.join(dir, baseName),
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

export function formatLockedBrowserDbError(browserLabel: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/EBUSY|resource busy|locked|cannot access the file/i.test(msg)) {
    return `Could not read cookies from the ${browserLabel} sign-in window. Click Import session again — Inix will close that window automatically.`;
  }
  if (/Command failed: powershell/i.test(msg)) {
    return `Could not read cookies from the ${browserLabel} sign-in window. Click Import session again.`;
  }
  return msg;
}
