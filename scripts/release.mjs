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
 *   node scripts/release.mjs --version 0.1.23   # release a specific version
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bumpPatchVersion, runGenerateReleaseNotes } from "./generate-release-notes.mjs";
import { updateGithubReleaseFromFile } from "./github-release.mjs";
import {
  closeLockingProcesses,
  copyArtifactsToReleaseBuild,
  createStagingOutputDir,
  runElectronBuilder,
} from "./electron-build.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLISH_NOTES = path.join(ROOT, "release-notes", "publish.md");
const DEFAULT_MODEL = "llama3.2:latest";

const VERSION_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?$/;

function parseArgs(argv) {
  const opts = {
    noPush: false,
    noGit: false,
    skipNotes: false,
    dryRun: false,
    notesOnly: false,
    republish: false,
    forceNotes: false,
    version: "",
    model: DEFAULT_MODEL,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-push") opts.noPush = true;
    else if (arg === "--no-git") opts.noGit = true;
    else if (arg === "--skip-notes") opts.skipNotes = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--notes-only") opts.notesOnly = true;
    else if (arg === "--republish") opts.republish = true;
    else if (arg === "--force") opts.forceNotes = true;
    else if (arg === "--version" || arg === "-v") {
      opts.version = argv[++i] ?? "";
      if (!opts.version) throw new Error("--version requires a value, e.g. --version 0.1.23");
    } else if (arg.startsWith("--version=")) {
      opts.version = arg.slice("--version=".length);
      if (!opts.version) throw new Error("--version requires a value, e.g. --version=0.1.23");
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Inix release — bump version, notes, build, GitHub publish

  npm run release
  npm run release -- --version 0.1.23

Options:
  --version, -v <ver>  Release this version (instead of auto patch bump)
  --no-push            Skip git push after publish
  --no-git             Skip git commit and tag
  --skip-notes         Skip Ollama; use existing release-notes/publish.md
  --republish          Build/publish without bumping (uses --version or package.json)
  --force              Generate notes even if no git changes since last tag
  --notes-only         Only upload notes to the current package.json version on GitHub (no build)
  --dry-run            Preview version + notes only, no build or publish
  -h, --help           Show this help

Requires:
  - Ollama running with llama3.2:latest (unless --skip-notes)
  - GH_TOKEN in environment (GitHub release publish)
`);
      process.exit(0);
    }
  }

  if (opts.version && !VERSION_RE.test(opts.version)) {
    throw new Error(`Invalid version "${opts.version}". Use semver like 0.1.23`);
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

/** Build into a fresh temp dir so locked release-build/win-unpacked never blocks packaging. */
function prepareReleaseBuild() {
  closeLockingProcesses();
  return createStagingOutputDir();
}

function buildShellCommand(buildOutput) {
  return "npm run installer:assets && npx tsc && npx vite build";
}

function runReleaseBuild(buildOutput) {
  runShell(buildShellCommand(buildOutput));
  runElectronBuilder(buildOutput, { publish: true });
  copyArtifactsToReleaseBuild(buildOutput);
  try {
    fs.rmSync(buildOutput, { recursive: true, force: true });
  } catch {
    console.warn(`Could not remove staging dir (safe to delete): ${buildOutput}`);
  }
}

function gitOk(...args) {
  try {
    execFileSync("git", args, { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function tagExistsOnRemote(tag) {
  const out = execFileSync("git", ["ls-remote", "--tags", "origin", tag], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  return out.length > 0;
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
  if (tagExistsOnRemote(tag)) {
    // electron-builder --publish always creates the release tag on GitHub during Step 4.
    console.log(`Tag ${tag} is already on GitHub (created during publish).`);
  } else {
    run("git", ["push", "origin", tag]);
    console.log(`Pushed tag ${tag}.`);
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
  const nextVersion = opts.version
    ? opts.version
    : opts.republish
      ? currentVersion
      : bumpPatchVersion(currentVersion);

  console.log("\n=== Inix release ===");
  if (opts.republish) {
    console.log(`Republishing v${nextVersion} (no version bump)\n`);
    opts.noGit = true;
    opts.skipNotes = true;
  } else if (opts.version) {
    console.log(`Version: v${currentVersion} → v${nextVersion} (--version)\n`);
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
    if (currentVersion !== nextVersion) {
      writePackageVersion(nextVersion);
      console.log(`package.json → ${nextVersion}`);
    } else {
      console.log(`package.json already at ${nextVersion}`);
    }

    console.log("Step 3/5 — Commit & tag…");
    try {
      gitCommitAndTag(nextVersion, opts);
    } catch (err) {
      console.warn("Git commit/tag issue (continuing to build):", err.message || err);
    }
  } else {
    console.log("Step 2/5 — Skipped (republish)");
    if (opts.version && currentVersion !== nextVersion) {
      writePackageVersion(nextVersion);
      console.log(`package.json → ${nextVersion}`);
    }
    console.log("Step 3/5 — Skipped (republish)");
  }

  ensureGhToken();

  console.log("Step 4/5 — Build & publish to GitHub Releases…");
  const buildOutput = prepareReleaseBuild();
  console.log(`Building into ${buildOutput} (fresh staging dir — avoids locked app.asar)`);
  runReleaseBuild(buildOutput);

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
