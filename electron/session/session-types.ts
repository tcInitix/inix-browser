import { randomUUID } from "node:crypto";

export interface SessionTabNode {
  id: string;
  url: string;
  title: string;
  private?: boolean;
  parentId?: string | null;
  children: string[];
  order: number;
  scrollY?: number;
  frozen?: boolean;
  lastActiveAt: number;
}

export interface SessionSnapshot {
  version: 1;
  activeTabId: string;
  rootTabIds: string[];
  nodes: Record<string, SessionTabNode>;
  savedAt: number;
  cleanShutdown?: boolean;
}

export function emptySnapshot(): SessionSnapshot {
  const id = randomUUID();
  const now = Date.now();
  return {
    version: 1,
    activeTabId: id,
    rootTabIds: [id],
    nodes: {
      [id]: {
        id,
        url: "inix://newtab",
        title: "New Tab",
        children: [],
        order: 0,
        lastActiveAt: now,
      },
    },
    savedAt: now,
  };
}
