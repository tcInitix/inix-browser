import { session, type BrowserWindow } from "electron";
import { runQuery, runExec, saveDatabase } from "../storage/db";
import { setupPrivacyBlocking } from "../privacy/blocker";
import { wirePermissionHandlersForPartition } from "../permissions";
import { wireDownloadsForPartition } from "../downloads/manager";

export const DEFAULT_PROFILE_ID = "default";
export const BROWSING_PARTITION = "persist:inix";
export const PRIVATE_PARTITION = "inix-private";

export interface BrowserProfile {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

type TaggedWindow = BrowserWindow & { __inixProfileId?: string };

export function getProfilePartition(profileId: string): string {
  if (profileId === DEFAULT_PROFILE_ID) return BROWSING_PARTITION;
  return `persist:inix-profile-${profileId}`;
}

export function getAllProfilePartitions(): string[] {
  const profiles = listProfiles();
  return profiles.map((p) => getProfilePartition(p.id));
}

export function getWindowProfileId(win: BrowserWindow): string {
  return (win as TaggedWindow).__inixProfileId ?? DEFAULT_PROFILE_ID;
}

export function setWindowProfileId(win: BrowserWindow, profileId: string): void {
  (win as TaggedWindow).__inixProfileId = profileId;
}

export function listProfiles(): BrowserProfile[] {
  return runQuery<BrowserProfile>(
    "SELECT id, name, color, created_at FROM browser_profiles ORDER BY created_at ASC"
  );
}

export function getProfile(id: string): BrowserProfile | null {
  const rows = runQuery<BrowserProfile>(
    "SELECT id, name, color, created_at FROM browser_profiles WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

export function createProfile(name: string, color = "#6366f1"): BrowserProfile {
  const id = crypto.randomUUID();
  const now = Date.now();
  runExec(
    "INSERT INTO browser_profiles (id, name, color, created_at) VALUES (?, ?, ?, ?)",
    [id, name.trim() || "Profile", color, now]
  );
  saveDatabase();
  ensureProfileSession(id);
  return { id, name: name.trim() || "Profile", color, created_at: now };
}

export function renameProfile(id: string, name: string): boolean {
  if (id === DEFAULT_PROFILE_ID) return false;
  runExec("UPDATE browser_profiles SET name = ? WHERE id = ?", [name.trim(), id]);
  saveDatabase();
  return true;
}

export function deleteProfile(id: string): boolean {
  if (id === DEFAULT_PROFILE_ID) return false;
  runExec("DELETE FROM browser_profiles WHERE id = ?", [id]);
  saveDatabase();
  return true;
}

export function ensureProfileSession(profileId: string): void {
  const partition = getProfilePartition(profileId);
  const sess = session.fromPartition(partition);
  const browserUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  sess.setUserAgent(browserUA);
  setupPrivacyBlocking(sess);
  wirePermissionHandlersForPartition(partition);
  wireDownloadsForPartition(partition);
}

export function initProfileSessions(): void {
  for (const profile of listProfiles()) {
    ensureProfileSession(profile.id);
  }
  const privateSess = session.fromPartition(PRIVATE_PARTITION);
  privateSess.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  setupPrivacyBlocking(privateSess);
}

export function seedDefaultProfile(): void {
  const existing = runQuery<{ id: string }>(
    "SELECT id FROM browser_profiles WHERE id = ?",
    [DEFAULT_PROFILE_ID]
  );
  if (existing.length > 0) return;
  runExec(
    "INSERT INTO browser_profiles (id, name, color, created_at) VALUES (?, ?, ?, ?)",
    [DEFAULT_PROFILE_ID, "Default", "#6366f1", Date.now()]
  );
  saveDatabase();
}
