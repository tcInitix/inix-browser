import { session } from "electron";
import { getAllProfilePartitions, PRIVATE_PARTITION } from "./profiles/manager";

export interface SiteRecord {
  origin: string;
  partition: string;
  cookieCount: number;
}

function browsingPartitions(): string[] {
  return [...getAllProfilePartitions(), PRIVATE_PARTITION];
}

export async function clearBrowsingData(opts: {
  cookies?: boolean;
  cache?: boolean;
  storage?: boolean;
  privateOnly?: boolean;
}): Promise<void> {
  const partitions = opts.privateOnly ? [PRIVATE_PARTITION] : browsingPartitions();

  for (const partition of partitions) {
    const sess = session.fromPartition(partition);

    if (opts.cache) {
      await sess.clearCache();
    }

    const storages: ("cookies" | "localstorage" | "indexdb" | "serviceworkers")[] = [];
    if (opts.cookies) storages.push("cookies");
    if (opts.storage) {
      storages.push("localstorage", "indexdb", "serviceworkers");
    }

    if (storages.length > 0) {
      await sess.clearStorageData({ storages });
    }
  }
}

export async function listSites(): Promise<SiteRecord[]> {
  const byKey = new Map<string, SiteRecord>();

  for (const partition of browsingPartitions()) {
    const cookies = await session.fromPartition(partition).cookies.get({});
    for (const cookie of cookies) {
      const host = cookie.domain?.startsWith(".") ? cookie.domain.slice(1) : cookie.domain ?? "";
      const origin = `${cookie.secure ? "https" : "http"}://${host}`;
      const key = `${partition}|${origin}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.cookieCount += 1;
      } else {
        byKey.set(key, { origin, partition, cookieCount: 1 });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.origin.localeCompare(b.origin));
}

export async function clearSiteData(
  origin: string,
  opts: { cookies?: boolean; cache?: boolean; storage?: boolean; partition?: string } = {}
): Promise<void> {
  const partitions = opts.partition ? [opts.partition] : browsingPartitions();
  const clearCookies = opts.cookies !== false;
  const clearStorage = opts.storage !== false;

  for (const partition of partitions) {
    const sess = session.fromPartition(partition);

    if (clearCookies) {
      const cookies = await sess.cookies.get({ url: origin });
      for (const cookie of cookies) {
        const url = `${cookie.secure ? "https" : "http"}://${(cookie.domain ?? "").replace(/^\./, "")}${cookie.path}`;
        try {
          await sess.cookies.remove(url, cookie.name);
        } catch {
          // ignore invalid cookie URLs
        }
      }
    }

    if (clearStorage) {
      await sess.clearStorageData({
        origin,
        storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage"],
      });
    }

    if (opts.cache) {
      await sess.clearCache();
    }
  }
}

export async function getStorageUsage(): Promise<{ partition: string; bytes: number }[]> {
  const results: { partition: string; bytes: number }[] = [];
  for (const partition of browsingPartitions()) {
    const bytes = await session.fromPartition(partition).getCacheSize();
    results.push({ partition, bytes });
  }
  return results;
}
