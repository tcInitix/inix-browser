import crypto from "node:crypto";
import { session, type BrowserWindow } from "electron";
import { getAllProfilePartitions, PRIVATE_PARTITION } from "./profiles/manager";

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

export function wirePermissionHandlersForPartition(partition: string): void {
  if (wiredPartitions.has(partition)) return;
  wiredPartitions.add(partition);

  const sess = session.fromPartition(partition);

  sess.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return granted.has(grantKey(partition, requestingOrigin, permission));
  });

  sess.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl ?? webContents.getURL();
    const origin = toOrigin(requestingUrl);
    const id = crypto.randomUUID();

    const timeoutId = setTimeout(() => {
      const entry = pending.get(id);
      if (entry) {
        pending.delete(id);
        entry.resolve(false);
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

  const g = globalThis as typeof globalThis & { __inixPermissionsInit?: boolean };
  if (g.__inixPermissionsInit) return;
  g.__inixPermissionsInit = true;

  for (const partition of browsingPartitions()) {
    wirePermissionHandlersForPartition(partition);
  }
}

export function respondToPermission(id: string, allow: boolean): boolean {
  const entry = pending.get(id);
  if (!entry) return false;

  clearTimeout(entry.timeoutId);
  pending.delete(id);

  if (allow) {
    granted.add(grantKey(entry.partition, entry.origin, entry.permission));
  }

  entry.resolve(allow);
  return true;
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
  return removed;
}

export function revokeAllPermissions(): void {
  granted.clear();
}
