import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const outPath = path.join(root, "public", "release-notes.md");

const candidates = [
  path.join(root, "release-notes", `v${version}.md`),
  path.join(root, "release-notes", "publish.md"),
];

const source = candidates.find((candidate) => fs.existsSync(candidate));
if (!source) {
  console.warn(`No release notes found for v${version}; skipping public/release-notes.md`);
  process.exit(0);
}

fs.copyFileSync(source, outPath);
console.log(`Release notes copied: ${path.relative(root, source)} → public/release-notes.md`);
