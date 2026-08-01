import crypto from "node:crypto";
import { session, type BrowserWindow } from "electron";
import { getAllProfilePartitions, PRIVATE_PARTITION } from "./profiles/manager";
import { getSetting, setSetting } from "./storage/settings";

interface PendingPermission {
  resolve: (allow: boolean) => void;
  partition: string;
  origin: string;
  permission: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface PermissionGrant {
  partition: string;
  origin: string;
  permission: string;
}

const pending = new Map<string, PendingPermission>();
const granted = new Set<string>();
const denied = new Set<string>();
const wiredPartitions = new Set<string>();

let getWindow: (() => BrowserWindow | null) | null = null;

function browsingPartitions(): string[] {
  return [...getAllProfilePartitions(), PRIVATE_PARTITION];
}

function grantKey(partition: string, origin: string, permission: string): string {
  return `${partition}|${origin}|${permission}`;
}

function parseGrantKey(key: string): PermissionGrant | null {
  const parts = key.split("|");
  if (parts.length < 3) return null;
  const permission = parts.pop()!;
  const partition = parts.shift()!;
  const origin = parts.join("|");
  return { partition, origin, permission };
}

function toOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function loadDeniedFromStorage(): void {
  try {
    const raw = getSetting("permission_denied");
    if (!raw) return;
    const keys = JSON.parse(raw) as string[];
    for (const key of keys) denied.add(key);
  } catch {
    // ignore corrupt storage
  }
}

function persistDenied(key: string): void {
  denied.add(key);
  setSetting("permission_denied", JSON.stringify([...denied]));
}

function removeDeniedForOrigin(partition: string, origin: string): void {
  for (const key of [...denied]) {
    const parsed = parseGrantKey(key);
    if (parsed && parsed.partition === partition && parsed.origin === origin) {
      denied.delete(key);
    }
  }
  setSetting("permission_denied", JSON.stringify([...denied]));
}

function dismissPrompt(id: string): void {
  getWindow?.()?.webContents.send("permission:dismiss", { id });
}

function resolvePending(id: string, allow: boolean): boolean {
  const entry = pending.get(id);
  if (!entry) return false;

  clearTimeout(entry.timeoutId);
  pending.delete(id);
  dismissPrompt(id);

  const key = grantKey(entry.partition, entry.origin, entry.permission);
  if (allow) {
    granted.add(key);
    denied.delete(key);
    setSetting("permission_denied", JSON.stringify([...denied]));
  } else {
    persistDenied(key);
  }

  entry.resolve(allow);
  return true;
}

function findPendingForKey(key: string): string | null {
  for (const [id, entry] of pending) {
    if (grantKey(entry.partition, entry.origin, entry.permission) === key) return id;
  }
  return null;
}

export function wirePermissionHandlersForPartition(partition: string): void {
  if (wiredPartitions.has(partition)) return;
  wiredPartitions.add(partition);

  const sess = session.fromPartition(partition);

  sess.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const key = grantKey(partition, requestingOrigin, permission);
    if (denied.has(key)) return false;
    return granted.has(key);
  });

  sess.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl ?? webContents.getURL();
    const origin = toOrigin(requestingUrl);
    const key = grantKey(partition, origin, permission);

    if (granted.has(key)) {
      callback(true);
      return;
    }

    if (denied.has(key)) {
      callback(false);
      return;
    }

    const existingId = findPendingForKey(key);
    if (existingId) {
      callback(false);
      return;
    }

    const id = crypto.randomUUID();

    const timeoutId = setTimeout(() => {
      if (pending.has(id)) {
        persistDenied(key);
        resolvePending(id, false);
      }
    }, 60_000);

    pending.set(id, {
      resolve: callback,
      partition,
      origin,
      permission,
      timeoutId,
    });

    getWindow?.()?.webContents.send("permission:request", {
      id,
      permission,
      requestingUrl,
    });
  });
}

export function initPermissionHandler(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter;
  loadDeniedFromStorage();

  const g = globalThis as typeof globalThis & { __inixPermissionsInit?: boolean };
  if (g.__inixPermissionsInit) return;
  g.__inixPermissionsInit = true;

  for (const partition of browsingPartitions()) {
    wirePermissionHandlersForPartition(partition);
  }
}

export function respondToPermission(id: string, allow: boolean): boolean {
  return resolvePending(id, allow);
}

export function listPermissionGrants(): PermissionGrant[] {
  const rows: PermissionGrant[] = [];
  for (const key of granted) {
    const parsed = parseGrantKey(key);
    if (parsed) rows.push(parsed);
  }
  return rows.sort((a, b) => a.origin.localeCompare(b.origin));
}

export function revokePermissionGrant(partition: string, origin: string, permission: string): boolean {
  const key = grantKey(partition, origin, permission);
  if (!granted.has(key)) return false;
  granted.delete(key);
  return true;
}

export function revokeAllPermissionsForOrigin(partition: string, origin: string): number {
  let removed = 0;
  for (const key of [...granted]) {
    const parsed = parseGrantKey(key);
    if (parsed && parsed.partition === partition && parsed.origin === origin) {
      granted.delete(key);
      removed += 1;
    }
  }
  removeDeniedForOrigin(partition, origin);
  return removed;
}

export function revokeAllPermissions(): void {
  granted.clear();
}
