import { session } from "electron";
import { clearBrowsingData } from "../site-data";
import { clearHistory } from "./history";
import { clearAllBookmarks } from "./bookmarks";
import { destroyVault } from "./vault";
import { runExec, saveDatabase } from "./db";
import { setSetting } from "./settings";
import {
  DEFAULT_PROFILE_ID,
  deleteProfile,
  getProfilePartition,
  listProfiles,
} from "../profiles/manager";
import { sessionManager } from "../session/session-manager";

async function clearPartitionData(partition: string): Promise<void> {
  const sess = session.fromPartition(partition);
  await sess.clearCache();
  await sess.clearStorageData();
}

/** Remove all bookmarks, bar layout, library pins, and bookmark embeddings. */
export function resetBookmarks(): void {
  clearAllBookmarks();
}

/** Delete extra browser profiles and wipe their session partitions. */
export async function deleteAllExtraProfiles(): Promise<void> {
  for (const profile of listProfiles()) {
    if (profile.id === DEFAULT_PROFILE_ID) continue;
    await clearPartitionData(getProfilePartition(profile.id));
    deleteProfile(profile.id);
  }
}

/**
 * Factory reset: wipe local browsing data, library, vault, extra profiles,
 * and show first-run onboarding again. Default profile is kept (empty).
 */
export async function factoryResetApp(): Promise<void> {
  resetBookmarks();
  clearHistory();

  runExec("DELETE FROM workspace_pins");
  runExec("DELETE FROM workspaces");
  runExec("DELETE FROM url_aliases");
  destroyVault();

  await deleteAllExtraProfiles();
  await clearBrowsingData({ cookies: true, cache: true, storage: true });

  sessionManager.clearSnapshot();
  setSetting("onboarding_completed", "false");
  saveDatabase();
}
