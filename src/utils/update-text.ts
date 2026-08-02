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
const FILLER_NOTE_LINES =
  /^Note:\s*No new features have been added to this release\.?\s*$/i;

/** Remove markdown section headings that have no body content. */
function stripEmptyMarkdownSections(notes: string): string {
  const lines = notes.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const heading = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (!heading) {
      const trimmed = lines[i].trim();
      if (trimmed && !FILLER_NOTE_LINES.test(trimmed)) out.push(lines[i]);
      i++;
      continue;
    }

    const level = heading[1].length;
    const headingLine = lines[i];
    i++;
    const bodyStart = i;
    while (i < lines.length) {
      const next = lines[i].match(/^(#{1,3})\s+/);
      if (next && next[1].length <= level) break;
      i++;
    }

    const body = lines.slice(bodyStart, i);
    const hasContent = body.some((line) => {
      const t = line.trim();
      return t.length > 0 && !FILLER_NOTE_LINES.test(t);
    });

    if (hasContent) {
      out.push(headingLine, ...body);
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function prepareReleaseNotes(notes: string, version: string): string {
  const escaped = version.replace(/\./g, "\\.");
  const withoutTitle = notes
    .replace(new RegExp(`^#\\s*Inix\\s*v?${escaped}\\s*\\n+`, "i"), "")
    .replace(/^#\s+.+\n+/i, "")
    .trim();

  return stripEmptyMarkdownSections(withoutTitle);
}
