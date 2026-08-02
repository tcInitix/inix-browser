#!/usr/bin/env node
/**
 * Full Inix release pipeline:
 *   1. Bump patch version in package.json
 *   2. Generate release notes (Ollama) since last tag/push
 *   3. Commit, tag, build, publish to GitHub Releases with notes
 *   4. Push git + tags (installed apps auto-update from GitHub)
 *
 * Usage:
 *   npm run release
 *   node scripts/release.mjs --no-push        # publish to GitHub only, skip git push
 *   node scripts/release.mjs --skip-notes     # skip Ollama (use existing publish.md)
 *   node scripts/release.mjs --republish      # build/publish current version (no bump)
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bumpPatchVersion, runGenerateReleaseNotes } from "./generate-release-notes.mjs";
import { updateGithubReleaseFromFile } from "./github-release.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLISH_NOTES = path.join(ROOT, "release-notes", "publish.md");
const DEFAULT_MODEL = "llama3.2:latest";

function parseArgs(argv) {
  const opts = {
    noPush: false,
    noGit: false,
    skipNotes: false,
    dryRun: false,
    notesOnly: false,
    republish: false,
    forceNotes: false,
    model: DEFAULT_MODEL,
  };
  for (const arg of argv) {
    if (arg === "--no-push") opts.noPush = true;
    else if (arg === "--no-git") opts.noGit = true;
    else if (arg === "--skip-notes") opts.skipNotes = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--notes-only") opts.notesOnly = true;
    else if (arg === "--republish") opts.republish = true;
    else if (arg === "--force") opts.forceNotes = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Inix release — bump version, notes, build, GitHub publish

  npm run release

Options:
  --no-push       Skip git push after publish
  --no-git        Skip git commit and tag
  --skip-notes    Skip Ollama; use existing release-notes/publish.md
  --republish     Build/publish package.json version without bumping (recovery)
  --force         Generate notes even if no git changes since last tag
  --notes-only    Only upload notes to the current package.json version on GitHub (no build)
  --dry-run       Preview version + notes only, no build or publish
  -h, --help      Show this help

Requires:
  - Ollama running with llama3.2:latest (unless --skip-notes)
  - GH_TOKEN in environment (GitHub release publish)
`);
      process.exit(0);
    }
  }
  return opts;
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version ?? "0.0.0";
}

function writePackageVersion(version) {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function ensureGhToken() {
  if (process.env.GH_TOKEN) return;

  if (process.platform === "win32") {
    for (const scope of ["User", "Machine"]) {
      try {
        const value = execFileSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `[Environment]::GetEnvironmentVariable('GH_TOKEN', '${scope}')`,
          ],
          { encoding: "utf8" }
        ).trim();
        if (value) {
          process.env.GH_TOKEN = value;
          return;
        }
      } catch {
        // try next scope
      }
    }
  }

  throw new Error(
    "GH_TOKEN is not set. Add it in Windows Environment Variables, then restart the terminal.\n" +
      "The token needs repo + contents write access for tcInitix/inix-browser releases."
  );
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...opts,
  });
}

function runShell(command) {
  execSync(command, { cwd: ROOT, stdio: "inherit", shell: true });
}

/** Release rebuild fails if a running Inix build holds locks on release/win-unpacked. */
function prepareReleaseBuild() {
  if (process.platform === "win32") {
    for (const image of ["Inix.exe", "electron.exe"]) {
      try {
        execFileSync("taskkill", ["/IM", image, "/F", "/T"], { stdio: "pipe" });
        console.log(`Closed ${image} before build.`);
      } catch {
        // not running
      }
    }

    try {
      execSync("ping -n 2 127.0.0.1 > nul", { stdio: "ignore", shell: true });
    } catch {
      // ignore
    }
  }

  // Cursor/Defender often lock release/win-unpacked/app.asar in this workspace.
  // Build into a fresh output dir so electron-builder never has to delete the stale tree.
  const buildOutput = path.join(ROOT, "release-build");
  fs.mkdirSync(buildOutput, { recursive: true });
  return buildOutput;
}

function buildShellCommand(buildOutput) {
  const outputArg = JSON.stringify(buildOutput);
  return (
    "npm run installer:assets && npx tsc && npx vite build && " +
    `npx electron-builder --publish always --config.directories.output=${outputArg}`
  );
}

function gitOk(...args) {
  try {
    execFileSync("git", args, { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function gitCommitAndTag(version, opts) {
  if (opts.noGit) {
    console.log("Skipping git commit/tag (--no-git).");
    return;
  }

  if (!gitOk("rev-parse", "--git-dir")) {
    console.warn("Not a git repo — skipping commit/tag.");
    return;
  }

  run("git", ["add", "-A"]);

  let hasStagedChanges = false;
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT, stdio: "pipe" });
  } catch {
    hasStagedChanges = true;
  }

  if (hasStagedChanges) {
    run("git", ["commit", "-m", `Release v${version}`]);
  } else {
    console.log("Nothing new to commit — skipping commit.");
  }

  const tag = `v${version}`;
  if (gitOk("rev-parse", tag)) {
    console.warn(`Tag ${tag} already exists — skipping tag create.`);
  } else {
    run("git", ["tag", tag]);
  }
}

function gitPush(version, opts) {
  if (opts.noPush || opts.noGit) {
    console.log("Skipping git push.");
    return;
  }

  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  if (branch) {
    run("git", ["push", "origin", branch]);
  }

  const tag = `v${version}`;
  try {
    run("git", ["push", "origin", tag]);
  } catch {
    // electron-builder --publish always creates the tag on GitHub before we push.
    console.warn(`Tag ${tag} already exists on GitHub — skipping tag push.`);
  }
}

async function publishNotesToGithub(version) {
  if (!fs.existsSync(PUBLISH_NOTES)) {
    throw new Error(`Missing ${path.relative(ROOT, PUBLISH_NOTES)}`);
  }
  console.log("Uploading release notes to GitHub…");
  const result = await updateGithubReleaseFromFile({
    version,
    notesPath: PUBLISH_NOTES,
    token: process.env.GH_TOKEN,
    publish: true,
  });
  console.log(`GitHub release updated: ${result.htmlUrl}`);
  if (result.draft) {
    console.warn("Release is still marked as draft on GitHub.");
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.notesOnly) {
    ensureGhToken();
    const version = readPackageVersion();
    if (!opts.skipNotes) {
      await runGenerateReleaseNotes({
        version,
        out: PUBLISH_NOTES,
        plain: true,
        model: opts.model,
        force: opts.forceNotes,
      });
    }
    await publishNotesToGithub(version);
    return;
  }

  const currentVersion = readPackageVersion();
  const nextVersion = opts.republish ? currentVersion : bumpPatchVersion(currentVersion);

  console.log("\n=== Inix release ===");
  if (opts.republish) {
    console.log(`Republishing v${currentVersion} (no version bump)\n`);
    opts.noGit = true;
    opts.skipNotes = true;
  } else {
    console.log(`Version: v${currentVersion} → v${nextVersion}\n`);
  }

  if (!opts.skipNotes) {
    console.log("Step 1/5 — Generate release notes (Ollama)…");
    const result = await runGenerateReleaseNotes({
      version: nextVersion,
      out: PUBLISH_NOTES,
      plain: true,
      model: opts.model,
      force: opts.forceNotes,
    });
    console.log("\n--- Release notes preview ---\n");
    console.log(result.notes);
    console.log("\n--- end preview ---\n");

    const archivePath = path.join(ROOT, "release-notes", `v${nextVersion}.md`);
    fs.copyFileSync(PUBLISH_NOTES, archivePath);
  } else {
    const archived = path.join(ROOT, "release-notes", `v${nextVersion}.md`);
    if (fs.existsSync(archived)) {
      fs.copyFileSync(archived, PUBLISH_NOTES);
      console.log(`Step 1/5 — Using ${path.relative(ROOT, archived)}`);
    } else if (fs.existsSync(PUBLISH_NOTES)) {
      console.log("Step 1/5 — Using release-notes/publish.md");
    } else {
      throw new Error(
        `Missing release notes. Add release-notes/v${nextVersion}.md or release-notes/publish.md.`
      );
    }
  }

  if (opts.dryRun) {
    console.log("Dry run complete — no version bump, build, or publish.");
    return;
  }

  if (!opts.republish) {
    console.log("Step 2/5 — Bump version…");
    writePackageVersion(nextVersion);
    console.log(`package.json → ${nextVersion}`);

    console.log("Step 3/5 — Commit & tag…");
    try {
      gitCommitAndTag(nextVersion, opts);
    } catch (err) {
      console.warn("Git commit/tag issue (continuing to build):", err.message || err);
    }
  } else {
    console.log("Step 2/5 — Skipped (republish)");
    console.log("Step 3/5 — Skipped (republish)");
  }

  ensureGhToken();

  console.log("Step 4/5 — Build & publish to GitHub Releases…");
  const buildOutput = prepareReleaseBuild();
  console.log(`Building into ${path.relative(ROOT, buildOutput)} (avoids locked release/win-unpacked)`);
  runShell(buildShellCommand(buildOutput));

  console.log("Step 5/5 — Attach release notes on GitHub…");
  await publishNotesToGithub(nextVersion);

  console.log("\nPushing git…");
  try {
    gitPush(nextVersion, opts);
  } catch (err) {
    console.warn("Git push failed — release may still be on GitHub:", err.message || err);
    console.warn(`Run manually: git push origin HEAD && git push origin v${nextVersion}`);
  }

  console.log(`\n✓ Released v${nextVersion} to GitHub.`);
  console.log("Installed Inix apps will pick up the update on next check.");
  console.log(`Notes: ${path.relative(ROOT, PUBLISH_NOTES)}`);
}

main().catch((err) => {
  console.error("\nRelease failed:", err.message || err);
  process.exit(1);
});
