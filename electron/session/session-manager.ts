import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { SessionSnapshot } from "./session-types";

const SAVE_DEBOUNCE_MS = 400;

class SessionManager {
  private snapshotPath = "";
  private tempPath = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: SessionSnapshot | null = null;

  init(): void {
    const dir = app.getPath("userData");
    this.snapshotPath = path.join(dir, "session-tree.json");
    this.tempPath = path.join(dir, "session-tree.json.tmp");
  }

  getRestore(): SessionSnapshot | null {
    if (!this.snapshotPath || !fs.existsSync(this.snapshotPath)) return null;
    try {
      const raw = fs.readFileSync(this.snapshotPath, "utf8");
      const snapshot = JSON.parse(raw) as SessionSnapshot;
      if (snapshot.version !== 1 || !snapshot.nodes || !snapshot.activeTabId) return null;
      return this.stripPrivate(snapshot);
    } catch {
      return null;
    }
  }

  wasCrashRestore(): boolean {
    const snap = this.getRestore();
    return !!snap && !snap.cleanShutdown;
  }

  sync(snapshot: SessionSnapshot): void {
    this.pending = this.stripPrivate({ ...snapshot, savedAt: Date.now(), cleanShutdown: false });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(false), SAVE_DEBOUNCE_MS);
  }

  flush(cleanShutdown = false): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    let toWrite = this.pending;
    if (!toWrite && this.snapshotPath && fs.existsSync(this.snapshotPath)) {
      try {
        toWrite = JSON.parse(fs.readFileSync(this.snapshotPath, "utf8")) as SessionSnapshot;
      } catch {
        return;
      }
    }
    if (!toWrite || !this.snapshotPath) return;
    const snapshot: SessionSnapshot = {
      ...this.stripPrivate(toWrite),
      savedAt: Date.now(),
      cleanShutdown,
    };
    try {
      fs.writeFileSync(this.tempPath, JSON.stringify(snapshot, null, 2), "utf8");
      fs.renameSync(this.tempPath, this.snapshotPath);
    } catch (err) {
      console.error("[session] save failed:", err);
    }
    this.pending = null;
  }

  updateNode(tabId: string, patch: Partial<SessionSnapshot["nodes"][string]>): void {
    const snap = this.getRestore();
    if (!snap?.nodes[tabId]) return;
    snap.nodes[tabId] = { ...snap.nodes[tabId], ...patch };
    this.sync(snap);
  }

  private stripPrivate(snapshot: SessionSnapshot): SessionSnapshot {
    const nodes = { ...snapshot.nodes };
    const privateIds = new Set(
      Object.values(nodes).filter((n) => n.private).map((n) => n.id)
    );
    if (privateIds.size === 0) return snapshot;

    for (const id of privateIds) {
      delete nodes[id];
    }
    for (const node of Object.values(nodes)) {
      node.children = node.children.filter((c) => !privateIds.has(c));
      if (node.parentId && privateIds.has(node.parentId)) {
        node.parentId = null;
      }
    }
    const rootTabIds = snapshot.rootTabIds.filter((id) => !privateIds.has(id));
    let activeTabId = snapshot.activeTabId;
    if (privateIds.has(activeTabId)) {
      activeTabId = rootTabIds[0] ?? Object.keys(nodes)[0] ?? activeTabId;
    }
    if (rootTabIds.length === 0 && Object.keys(nodes).length > 0) {
      const first = Object.values(nodes).sort((a, b) => a.order - b.order)[0];
      if (first) rootTabIds.push(first.id);
    }
    return { ...snapshot, nodes, rootTabIds, activeTabId };
  }
}

export const sessionManager = new SessionManager();
