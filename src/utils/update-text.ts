/** Client-side sanitizer for update errors (matches electron/updater-text.ts). */

const TECHNICAL_MARKERS = [
  '"statusCode"',
  '"headers"',
  "createHttpError",
  "httpExecutor",
  "content-security-policy",
  "x-github-request-id",
  "set-cookie",
  "app.asar",
  "electron-updater",
  "cannot parse releases feed",
  "releases feed",
];

export function isTechnicalUpdateDump(text: string): boolean {
  const lower = text.toLowerCase();
  return TECHNICAL_MARKERS.some((m) => lower.includes(m));
}

export function friendlyUpdateError(message: string): string {
  const raw = message.trim();
  if (!raw) return "Could not check for updates.";

  if (isTechnicalUpdateDump(raw)) {
    const lower = raw.toLowerCase();
    if (lower.includes("404") || lower.includes("not found")) {
      return "No update release was found on GitHub yet. Publish a release, then try again.";
    }
    if (lower.includes("cannot parse releases feed") || lower.includes("releases feed")) {
      return "Could not read the update feed from GitHub. The release may still be processing — try again in a minute.";
    }
    return "Could not reach the update server. Check your connection and try again.";
  }

  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= 180) return firstLine;
  return `${firstLine.slice(0, 180)}…`;
}

/** Drop duplicate title lines already shown in the update dialog header. */
export function prepareReleaseNotes(notes: string, version: string): string {
  const escaped = version.replace(/\./g, "\\.");
  return notes
    .replace(new RegExp(`^#\\s*Inix\\s*v?${escaped}\\s*\\n+`, "i"), "")
    .replace(/^#\s+.+\n+/i, "")
    .trim();
}
