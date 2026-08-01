/**
 * Push release notes to an existing GitHub Release (and publish draft releases).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OWNER = "tcInitix";
const DEFAULT_REPO = "inix-browser";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Inix-Release-Script",
  };
}

async function githubJson(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(token),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String(data.message)
        : text.slice(0, 300);
    throw new Error(`GitHub API ${res.status}: ${msg}`);
  }
  return data;
}

async function findRelease(token, owner, repo, version) {
  const tags = [`v${version}`, version];
  for (const tag of tags) {
    try {
      return await githubJson(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        token
      );
    } catch {
      // try next tag format
    }
  }

  const releases = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`,
    token
  );
  if (!Array.isArray(releases)) return null;

  return (
    releases.find((r) => r.tag_name === `v${version}` || r.tag_name === version) ?? null
  );
}

/**
 * @param {object} opts
 * @param {string} opts.version
 * @param {string} opts.body
 * @param {string} opts.token
 * @param {string} [opts.owner]
 * @param {string} [opts.repo]
 * @param {boolean} [opts.publish] - set draft=false
 */
export async function updateGithubReleaseNotes(opts) {
  const owner = opts.owner ?? DEFAULT_OWNER;
  const repo = opts.repo ?? DEFAULT_REPO;
  const token = opts.token;
  const body = opts.body.trim();

  if (!token) throw new Error("GH_TOKEN is required to update GitHub release notes.");
  if (!body) throw new Error("Release notes body is empty.");

  const release = await findRelease(token, owner, repo, opts.version);
  if (!release?.id) {
    throw new Error(`No GitHub release found for v${opts.version}. Publish the build first.`);
  }

  const patch = {
    body,
    name: release.name || `Inix v${opts.version}`,
  };
  if (opts.publish !== false) {
    patch.draft = false;
  }

  const updated = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );

  return {
    id: updated.id,
    htmlUrl: updated.html_url,
    draft: updated.draft,
    tag: updated.tag_name,
  };
}

export async function updateGithubReleaseFromFile(opts) {
  const notesPath = opts.notesPath;
  const body = fs.readFileSync(notesPath, "utf8").trim();
  return updateGithubReleaseNotes({
    ...opts,
    body,
  });
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const version = process.argv[2];
  const notesPath = process.argv[3];
  if (!version || !notesPath) {
    console.error("Usage: node scripts/github-release.mjs <version> <notes-file>");
    process.exit(1);
  }
  const token = process.env.GH_TOKEN;
  updateGithubReleaseFromFile({ version, notesPath, token, publish: true })
    .then((r) => {
      console.log(`Updated release ${r.tag}: ${r.htmlUrl}`);
      if (r.draft) console.warn("Release is still a draft.");
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
