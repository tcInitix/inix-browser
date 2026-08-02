import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconPng = path.join(root, "public", "icon.png");
const buildDir = path.join(root, "build");
const iconIco = path.join(buildDir, "icon.ico");

if (!fs.existsSync(iconPng)) {
  console.error(`Missing ${iconPng} — run generate-installer-assets.ps1 first`);
  process.exit(1);
}

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// png-to-ico accepts a single PNG and embeds standard Windows icon sizes.
const buf = await pngToIco(iconPng);
fs.writeFileSync(iconIco, buf);
fs.copyFileSync(iconIco, path.join(buildDir, "installerIcon.ico"));
fs.copyFileSync(iconIco, path.join(buildDir, "uninstallerIcon.ico"));

console.log(`App icon written to ${iconIco}`);
