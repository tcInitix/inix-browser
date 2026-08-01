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
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bumpPatchVersion, runGenerateReleaseNotes } from "./generate-release-notes.mjs";

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
    model: DEFAULT_MODEL,
  };
  for (const arg of argv) {
    if (arg === "--no-push") opts.noPush = true;
    else if (arg === "--no-git") opts.noGit = true;
    else if (arg === "--skip-notes") opts.skipNotes = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Inix release — bump version, notes, build, GitHub publish

  npm run release

Options:
  --no-push       Skip git push after publish
  --no-git        Skip git commit and tag
  --skip-notes    Skip Ollama; use existing release-notes/publish.md
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
  run("git", ["push", "origin", `v${version}`]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const currentVersion = readPackageVersion();
  const nextVersion = bumpPatchVersion(currentVersion);

  console.log("\n=== Inix release ===");
  console.log(`Version: v${currentVersion} → v${nextVersion}\n`);

  if (!opts.skipNotes) {
    console.log("Step 1/4 — Generate release notes (Ollama)…");
    const result = await runGenerateReleaseNotes({
      version: nextVersion,
      out: PUBLISH_NOTES,
      plain: true,
      model: opts.model,
    });
    console.log("\n--- Release notes preview ---\n");
    console.log(result.notes);
    console.log("\n--- end preview ---\n");
  } else if (!fs.existsSync(PUBLISH_NOTES)) {
    throw new Error(`Missing ${path.relative(ROOT, PUBLISH_NOTES)}. Run without --skip-notes first.`);
  } else {
    console.log("Step 1/4 — Skipping notes (--skip-notes), using publish.md");
  }

  if (opts.dryRun) {
    console.log("Dry run complete — no version bump, build, or publish.");
    return;
  }

  console.log("Step 2/4 — Bump version…");
  writePackageVersion(nextVersion);
  console.log(`package.json → ${nextVersion}`);

  console.log("Step 3/4 — Commit & tag…");
  try {
    gitCommitAndTag(nextVersion, opts);
  } catch (err) {
    console.warn("Git commit/tag issue (continuing to build):", err.message || err);
  }

  ensureGhToken();

  console.log("Step 4/4 — Build & publish to GitHub Releases…");
  runShell("npx tsc && npx vite build && npx electron-builder --publish always");

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
