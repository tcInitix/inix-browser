#!/usr/bin/env node
/**
 * Generate user-facing release / patch notes since the last version tag or push.
 * Uses local Ollama (default: llama3.2:latest).
 *
 * Base ref priority: --since > latest v* tag > upstream branch > origin/main
 * Diff includes commits on HEAD plus all uncommitted local changes vs that base.
 *
 * Usage:
 *   npm run release:notes
 *   node scripts/generate-release-notes.mjs --out release-notes/v0.1.1.md
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_MODEL = "llama3.2:latest";
const DEFAULT_HOST = "http://127.0.0.1:11434";
const MAX_DIFF_CHARS = 48_000;
const MAX_UNTRACKED_FILES = 40;
const MAX_UNTRACKED_BYTES = 12_000;

function parseArgs(argv) {
  const opts = {
    model: DEFAULT_MODEL,
    host: DEFAULT_HOST,
    out: "",
    since: "",
    version: "",
    plain: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model") opts.model = argv[++i] ?? opts.model;
    else if (arg === "--host") opts.host = argv[++i] ?? opts.host;
    else if (arg === "--out") opts.out = argv[++i] ?? "";
    else if (arg === "--since") opts.since = argv[++i] ?? "";
    else if (arg === "--version") opts.version = argv[++i] ?? "";
    else if (arg === "--plain") opts.plain = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Generate Inix release notes via Ollama (since last tag or push)

Options:
  --model <name>     Ollama model (default: ${DEFAULT_MODEL})
  --host <url>       Ollama base URL (default: ${DEFAULT_HOST})
  --since <ref>      Compare against this git ref (default: latest v* tag or last push)
  --version <ver>    Release version for the notes (default: package.json)
  --out <file>       Write markdown to file (also prints to stdout)
  --plain            Omit HTML metadata header (for GitHub publish)
  --force            Generate even if no changes since baseline
  -h, --help         Show this help

Base ref order when --since is omitted:
  1. Latest semver tag (v*.*.*)
  2. Upstream tracking branch (e.g. origin/main)
  3. origin/main
`);
      process.exit(0);
    }
  }
  return opts;
}

function git(...args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString?.() ?? "";
    if (stderr) return `(${stderr.trim()})`;
    return "";
  }
}

function gitOk(...args) {
  try {
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolveBaseRef(explicitSince) {
  if (explicitSince) {
    return { ref: explicitSince, label: explicitSince, source: "manual" };
  }

  for (const match of ["v[0-9]*", "[0-9]*"]) {
    if (!gitOk("describe", "--tags", "--abbrev=0", "--match", match)) continue;
    const tag = git("describe", "--tags", "--abbrev=0", "--match", match);
    if (tag && !tag.startsWith("(")) {
      return { ref: tag, label: `${tag} (last version tag)`, source: "tag" };
    }
  }

  const upstream = git("rev-parse", "--abbrev-ref", "@{u}");
  if (upstream && !upstream.startsWith("(")) {
    return { ref: upstream, label: `${upstream} (last push)`, source: "upstream" };
  }

  if (gitOk("rev-parse", "--verify", "origin/main")) {
    return { ref: "origin/main", label: "origin/main (last push)", source: "origin/main" };
  }

  const firstCommit = git("rev-list", "--max-parents=0", "HEAD");
  return {
    ref: firstCommit || "HEAD~1",
    label: "first commit",
    source: "fallback",
  };
}

function readPackageVersion(override) {
  if (override) return override;
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version ?? "0.0.0";
}

function versionAtRef(ref) {
  const raw = git("show", `${ref}:package.json`);
  if (!raw || raw.startsWith("(")) return null;
  try {
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

function normalizeTagVersion(tag) {
  return tag.replace(/^v/i, "");
}

function truncate(text, max = MAX_DIFF_CHARS) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… [truncated ${text.length - max} chars for model context]`;
}

function listUntrackedFiles() {
  return git("ls-files", "--others", "--exclude-standard")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readUntrackedDiffs(files) {
  const chunks = [];
  for (const rel of files.slice(0, MAX_UNTRACKED_FILES)) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) continue;
    if (!/\.(tsx?|jsx?|css|json|md|ps1|mjs)$/i.test(rel)) {
      chunks.push(`=== new file: ${rel} (${stat.size} bytes, binary or skipped) ===`);
      continue;
    }
    const raw = fs.readFileSync(full, "utf8");
    const body =
      raw.length > MAX_UNTRACKED_BYTES
        ? `${raw.slice(0, MAX_UNTRACKED_BYTES)}\n… [file truncated]`
        : raw;
    chunks.push(`=== new file: ${rel} ===\n${body}`);
  }
  if (files.length > MAX_UNTRACKED_FILES) {
    chunks.push(`… and ${files.length - MAX_UNTRACKED_FILES} more untracked files`);
  }
  return chunks.join("\n\n");
}

function gatherGitContext(base) {
  const baseRef = base.ref;
  const date = new Date().toISOString().slice(0, 10);
  const branch = git("branch", "--show-current") || "unknown";
  const baseSha = git("rev-parse", baseRef) || baseRef;

  const commits = git(
    "log",
    `${baseRef}..HEAD`,
    "--pretty=format:%h %ad %s%n%b",
    "--date=short"
  );
  const commitCount = gitOk("rev-list", `${baseRef}..HEAD`)
    ? git("rev-list", "--count", `${baseRef}..HEAD`)
    : "0";

  // Working tree + index vs base ref (captures uncommitted work when HEAD == origin/main)
  const diffStat = git("diff", baseRef, "--stat");
  const fullDiff = git("diff", baseRef);

  const status = git("status", "--porcelain");
  const untrackedFiles = listUntrackedFiles();
  const untrackedDiff = readUntrackedDiffs(untrackedFiles);

  const previousVersion =
    base.source === "tag"
      ? normalizeTagVersion(baseRef)
      : versionAtRef(baseRef) ?? versionAtRef(baseSha);

  const hasCommits = commitCount !== "0";
  const hasDiff = Boolean(diffStat && !diffStat.startsWith("("));
  const hasUntracked = untrackedFiles.length > 0;

  return {
    date,
    branch,
    baseRef,
    baseLabel: base.label,
    baseSha,
    baseSource: base.source,
    previousVersion,
    commitCount,
    commits: commits || "(no new commits — changes may be local only)",
    diffStat: diffStat || "(no file changes vs base)",
    fullDiff,
    status: status || "(working tree clean)",
    untrackedFiles,
    untrackedDiff,
    hasChanges: hasCommits || hasDiff || hasUntracked,
  };
}

function buildPrompt(releaseVersion, ctx) {
  const sinceLabel = ctx.previousVersion
    ? `v${ctx.previousVersion} (${ctx.baseLabel})`
    : ctx.baseLabel;

  const untrackedList =
    ctx.untrackedFiles.length > 0 ? ctx.untrackedFiles.join("\n") : "(none)";

  return `You are writing release notes for **Inix**, a fast private desktop browser (Electron + React).

Audience: end users, not developers. Tone: clear, friendly, confident. No jargon like "IPC", "refactor", or "preload" unless you briefly explain the user benefit.

**Release version (this build):** v${releaseVersion}
**Previous version / baseline:** ${sinceLabel}
**Baseline commit:** ${ctx.baseSha}
**Date:** ${ctx.date}
**Branch:** ${ctx.branch}

Everything below is what changed **since the last published version or push**. Include both committed and uncommitted work.

## Commits since baseline (${ctx.commitCount})
${ctx.commits}

## File change summary (vs baseline, includes uncommitted)
${ctx.diffStat}

## Code diff (vs baseline, includes uncommitted)
${truncate(ctx.fullDiff) || "(none)"}

## Working tree status
${ctx.status}

## New untracked files
${untrackedList}

## Contents of new untracked files
${truncate(ctx.untrackedDiff, 24_000) || "(none)"}

---

Write **user-facing patch / release notes** for **v${releaseVersion}** in Markdown:

# Inix v${releaseVersion}

_One sentence tagline summarizing this update since ${sinceLabel}._

## What's new
## Improvements
## Fixes
## Notes

Rules:
- Only describe changes supported by the git data above
- Do not repeat or mention v${ctx.previousVersion ?? "the previous release"} features unless they were improved in this diff
- Group related changes; do not list every file
- Mention shortcuts and settings paths when relevant (e.g. Settings → Tabs)
- Omit empty sections entirely
- Keep under ~400 words
- Do not invent features or shortcuts
- Output ONLY the release notes markdown — never paste commits, diffs, file lists, or any git data back into your response`;
}

function cleanModelOutput(text) {
  const stopMarkers = [
    "\n## Commits since baseline",
    "\n## File change summary",
    "\n## Code diff",
    "\n## Working tree status",
    "\n## New untracked files",
    "\n## Contents of new untracked",
    "\nEverything below is what changed",
  ];
  let out = text.trim();
  for (const marker of stopMarkers) {
    const idx = out.indexOf(marker);
    if (idx > 0) out = out.slice(0, idx).trim();
  }
  return out;
}

async function ensureOllama(host, model) {
  const tagsUrl = `${host.replace(/\/$/, "")}/api/tags`;
  const res = await fetch(tagsUrl);
  if (!res.ok) {
    throw new Error(
      `Ollama not reachable at ${host} (${res.status}). Start Ollama and run: ollama pull ${model}`
    );
  }
  const data = await res.json();
  const names = (data.models ?? []).map((m) => m.name);
  const hasModel = names.some((n) => n === model || n.startsWith(`${model}:`));
  if (!hasModel) {
    console.warn(`Warning: "${model}" not found. Available: ${names.join(", ") || "(none)"}`);
    console.warn(`Run: ollama pull ${model}`);
  }
}

async function generateNotes(host, model, prompt) {
  const url = `${host.replace(/\/$/, "")}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You write concise, accurate product release notes for a browser app. Output Markdown release notes only. Never include raw git output, diffs, commit lists, or file paths in your response.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama chat failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Ollama returned an empty response.");
  return cleanModelOutput(content);
}

export function bumpPatchVersion(version) {
  const parts = version.split(".").map((n) => parseInt(n, 10));
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

export async function runGenerateReleaseNotes(opts = {}) {
  const model = opts.model ?? DEFAULT_MODEL;
  const host = opts.host ?? DEFAULT_HOST;
  const base = resolveBaseRef(opts.since ?? "");
  const releaseVersion = opts.version ?? readPackageVersion("");

  const ctx = gatherGitContext(base);

  if (!ctx.hasChanges && !opts.force) {
    throw new Error(`No changes found since ${base.ref}. Commit work first or pass --force.`);
  }

  await ensureOllama(host, model);
  const notes = await generateNotes(host, model, buildPrompt(releaseVersion, ctx));

  const defaultOut = path.join(
    ROOT,
    "release-notes",
    `v${releaseVersion}-since-${ctx.previousVersion ?? "last"}.md`
  );
  const outPath = opts.out ? path.resolve(ROOT, opts.out) : defaultOut;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  let body = notes + "\n";
  if (!opts.plain) {
    const header =
      `<!-- Generated ${new Date().toISOString()}\n` +
      `     Release: v${releaseVersion}\n` +
      `     Since: ${ctx.baseLabel} (${ctx.baseRef} @ ${ctx.baseSha.slice(0, 7)})\n` +
      `     Previous version: ${ctx.previousVersion ?? "unknown"}\n` +
      `     Model: ${model} -->\n\n`;
    body = header + body;
  }

  fs.writeFileSync(outPath, body, "utf8");

  return { notes, outPath, ctx, releaseVersion, base, model };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const releaseVersion = opts.version || readPackageVersion("");

  console.error(`Baseline: ${resolveBaseRef(opts.since).label}`);
  console.error(`Release notes for: v${releaseVersion}`);

  try {
    console.error(`Calling Ollama (${opts.model})…`);
    const result = await runGenerateReleaseNotes({
      model: opts.model,
      host: opts.host,
      since: opts.since,
      version: releaseVersion,
      out: opts.out,
      plain: opts.plain,
      force: opts.force,
    });

    console.error(
      `Found ${result.ctx.commitCount} commit(s), diff vs baseline, ${result.ctx.untrackedFiles.length} new file(s).`
    );
    console.log(result.notes);
    console.error(`\nWrote ${path.relative(ROOT, result.outPath)}`);
  } catch (err) {
    if (!opts.force && err.message?.includes("No changes found")) {
      console.error(err.message);
      process.exit(0);
    }
    throw err;
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
