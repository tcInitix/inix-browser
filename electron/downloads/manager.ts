import { app, dialog, session, shell, type BrowserWindow, type DownloadItem } from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getAllProfilePartitions, PRIVATE_PARTITION } from "../profiles/manager";
import { getSettings } from "../storage/settings";

export interface DownloadRecord {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  startTime: number;
}

const wiredDownloadPartitions = new Set<string>();
const items = new Map<string, { record: DownloadRecord; item: DownloadItem }>();
let getWindow: (() => BrowserWindow | null) | null = null;

export function resolveDownloadDir(): string {
  const configured = getSettings().download_path.trim();
  const dir = configured || path.join(app.getPath("downloads"), "Inix");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function uniquePath(basePath: string): string {
  if (!fs.existsSync(basePath)) return basePath;
  const ext = path.extname(basePath);
  const stem = basePath.slice(0, -ext.length || undefined);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

function emit(record: DownloadRecord) {
  getWindow?.()?.webContents.send("download:updated", record);
}

export function wireDownloadsForPartition(partition: string): void {
  if (wiredDownloadPartitions.has(partition)) return;
  wiredDownloadPartitions.add(partition);

  session.fromPartition(partition).on("will-download", (_event, item) => {
    void handleDownload(item);
  });
}

async function handleDownload(item: DownloadItem): Promise<void> {
  const settings = getSettings();
  const filename = item.getFilename() || "download";
  const defaultDir = resolveDownloadDir();
  let savePath: string | undefined;

  if (settings.prompt_for_download) {
    const win = getWindow?.();
    const dialogOpts = {
      defaultPath: path.join(defaultDir, filename),
      buttonLabel: "Save",
    };
    const result =
      win && !win.isDestroyed()
        ? await dialog.showSaveDialog(win, dialogOpts)
        : await dialog.showSaveDialog(dialogOpts);
    if (result.canceled || !result.filePath) {
      item.cancel();
      return;
    }
    savePath = result.filePath;
  } else {
    savePath = uniquePath(path.join(defaultDir, filename));
  }

  item.setSavePath(savePath);

  const id = crypto.randomUUID();
  const record: DownloadRecord = {
    id,
    url: item.getURL(),
    filename: path.basename(savePath),
    savePath,
    totalBytes: item.getTotalBytes(),
    receivedBytes: 0,
    state: "progressing",
    startTime: Date.now(),
  };

  items.set(id, { record, item });
  emit(record);

  item.on("updated", (_e, state) => {
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    if (state === "interrupted") record.state = "interrupted";
    emit(record);
  });

  item.once("done", (_e, state) => {
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.state = state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted";
    emit(record);
  });
}

export function initDownloads(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter;

  const g = globalThis as typeof globalThis & { __inixDownloadsInit?: boolean };
  if (g.__inixDownloadsInit) return;
  g.__inixDownloadsInit = true;

  for (const partition of [...getAllProfilePartitions(), PRIVATE_PARTITION]) {
    wireDownloadsForPartition(partition);
  }
}

export function listDownloads(): DownloadRecord[] {
  return [...items.values()].map((v) => v.record).sort((a, b) => b.startTime - a.startTime);
}

export function cancelDownload(id: string): boolean {
  const entry = items.get(id);
  if (!entry || entry.record.state !== "progressing") return false;
  entry.item.cancel();
  return true;
}

export function openDownload(id: string): boolean {
  const entry = items.get(id);
  if (!entry) return false;
  if (entry.record.state === "completed") {
    shell.showItemInFolder(entry.record.savePath);
    return true;
  }
  return false;
}

export function clearCompletedDownloads(): void {
  for (const [id, entry] of items) {
    if (entry.record.state !== "progressing") items.delete(id);
  }
}

export async function pickDownloadFolder(window: BrowserWindow | null): Promise<string | null> {
  const opts = {
    properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[],
    defaultPath: resolveDownloadDir(),
  };
  const result =
    window && !window.isDestroyed()
      ? await dialog.showOpenDialog(window, opts)
      : await dialog.showOpenDialog(opts);
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}
