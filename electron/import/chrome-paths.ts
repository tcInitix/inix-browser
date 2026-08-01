import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ChromeProfile {
  id: string;
  name: string;
  dir: string;
}

export function getChromeUserDataDir(): string | null {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (!local) return null;
    const dir = path.join(local, "Google", "Chrome", "User Data");
    return fs.existsSync(dir) ? dir : null;
  }
  if (process.platform === "darwin") {
    const dir = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
    return fs.existsSync(dir) ? dir : null;
  }
  if (process.platform === "linux") {
    const dir = path.join(os.homedir(), ".config", "google-chrome");
    return fs.existsSync(dir) ? dir : null;
  }
  return null;
}

export function listChromeProfiles(): ChromeProfile[] {
  const userData = getChromeUserDataDir();
  if (!userData) return [];

  const localStatePath = path.join(userData, "Local State");
  let profileInfo: Record<string, { name?: string }> = {};
  try {
    const state = JSON.parse(fs.readFileSync(localStatePath, "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    profileInfo = state?.profile?.info_cache ?? {};
  } catch {
    // ignore missing or invalid Local State
  }

  const profiles: ChromeProfile[] = [];
  for (const ent of fs.readdirSync(userData, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const id = ent.name;
    if (id === "System Profile" || id === "Guest Profile") continue;
    const profileDir = path.join(userData, id);
    const bookmarksPath = path.join(profileDir, "Bookmarks");
    const loginDataPath = path.join(profileDir, "Login Data");
    if (!fs.existsSync(bookmarksPath) && !fs.existsSync(loginDataPath)) continue;
    const name = profileInfo[id]?.name ?? (id === "Default" ? "Default" : id);
    profiles.push({ id, name, dir: profileDir });
  }

  profiles.sort((a, b) => {
    if (a.id === "Default") return -1;
    if (b.id === "Default") return 1;
    return a.name.localeCompare(b.name);
  });
  return profiles;
}

export function getChromeProfilePaths(profileDir: string) {
  const userData = path.dirname(profileDir);
  return {
    bookmarks: path.join(profileDir, "Bookmarks"),
    loginData: path.join(profileDir, "Login Data"),
    localState: path.join(userData, "Local State"),
  };
}
