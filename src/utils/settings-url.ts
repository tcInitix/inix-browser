export const SETTINGS_SECTION_IDS = [
  "general",
  "appearance",
  "newtab",
  "privacy",
  "history",
  "passwords",
  "downloads",
  "tabs",
  "library",
  "profiles",
  "ai",
  "data",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export function isSettingsShellUrl(url: string): boolean {
  return url.split("#")[0]?.split("?")[0] === "inix://settings";
}

export function settingsShellUrl(section?: SettingsSectionId | "relay"): string {
  if (!section) return "inix://settings";
  return `inix://settings#${section}`;
}

export function parseSettingsUrl(url: string): {
  section: SettingsSectionId | null;
  scrollToId: string | null;
} {
  if (!isSettingsShellUrl(url)) return { section: null, scrollToId: null };

  const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  if (!hash) return { section: null, scrollToId: null };
  if (hash === "relay") return { section: "privacy", scrollToId: "settings-relay" };
  if ((SETTINGS_SECTION_IDS as readonly string[]).includes(hash)) {
    return { section: hash as SettingsSectionId, scrollToId: null };
  }
  return { section: null, scrollToId: hash };
}
