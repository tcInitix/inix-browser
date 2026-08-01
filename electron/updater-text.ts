/** Keep update UI human-readable — electron-updater errors often embed raw HTTP JSON. */

const TECHNICAL_MARKERS = [
  '"statusCode"',
  '"headers"',
  "createHttpError",
  "httpExecutor.js",
  "content-security-policy",
  "x-github-request-id",
  "set-cookie",
  "app.asar",
  "electron-updater",
];

export function isTechnicalUpdateDump(text: string): boolean {
  const lower = text.toLowerCase();
  return TECHNICAL_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

export function normalizeReleaseNotes(input: unknown): string | undefined {
  if (!input) return undefined;

  let text: string;
  if (typeof input === "string") {
    text = input;
  } else if (Array.isArray(input)) {
    text = input
      .map((n) => (typeof n === "object" && n && "note" in n ? String((n as { note?: string | null }).note ?? "") : ""))
      .filter(Boolean)
      .join("\n\n");
  } else {
    return undefined;
  }

  const trimmed = text.trim();
  if (!trimmed || isTechnicalUpdateDump(trimmed)) return undefined;
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return undefined;

  return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}…` : trimmed;
}

export function friendlyUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Update failed");

  if (isTechnicalUpdateDump(raw)) {
    try {
      const parsed = JSON.parse(raw) as { statusCode?: number; statusMessage?: string };
      if (parsed.statusCode === 404) {
        return "The update file was not found on GitHub yet. Wait a minute after publishing, then try again.";
      }
      if (parsed.statusCode) {
        return `Update server error (${parsed.statusCode}). Try again in a few minutes.`;
      }
    } catch {
      // not JSON
    }
    return "Could not reach the update server. Check your internet connection and try again.";
  }

  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 180) return firstLine;

  return "Update failed. Try again from Settings → Data → Check for updates.";
}

export async function fetchGithubReleaseBody(
  owner: string,
  repo: string,
  version: string
): Promise<string | undefined> {
  const tags = [`v${version}`, version];
  for (const tag of tags) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Inix-Browser-Updater",
          },
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { body?: string | null };
      return normalizeReleaseNotes(data.body ?? undefined);
    } catch {
      // try next tag format
    }
  }
  return undefined;
}
