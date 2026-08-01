import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rcedit } from "rcedit";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readPackageMeta() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const version = pkg.version ?? "0.0.0";
  const parts = version.split(".").map((part) => parseInt(part, 10) || 0);
  while (parts.length < 4) parts.push(0);
  const windowsVersion = parts.slice(0, 4).join(".");
  return {
    productName: pkg.build?.productName ?? "Inix",
    description: pkg.description ?? "Inix",
    version,
    windowsVersion,
    companyName: pkg.author ?? "Inix",
  };
}

/**
 * Apply the Inix icon and metadata to the Windows executable without winCodeSign.
 * Used because signAndEditExecutable must stay false on Windows when Developer Mode
 * is off (winCodeSign extraction fails on symlink creation).
 */
export default async function afterPack(context) {
  if (process.platform !== "win32") return;

  const meta = readPackageMeta();
  const exePath = path.join(context.appOutDir, `${meta.productName}.exe`);
  const iconPath = path.join(root, "build", "icon.ico");

  if (!fs.existsSync(exePath)) {
    throw new Error(`Expected Windows executable at ${exePath}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`Missing ${iconPath}. Run npm run installer:assets first.`);
  }

  await rcedit(exePath, {
    icon: iconPath,
    "file-version": meta.windowsVersion,
    "product-version": meta.windowsVersion,
    "version-string": {
      CompanyName: meta.companyName,
      FileDescription: meta.description,
      ProductName: meta.productName,
      LegalCopyright: `Copyright © ${new Date().getFullYear()} ${meta.companyName}`,
      InternalName: meta.productName,
      OriginalFilename: `${meta.productName}.exe`,
    },
  });

  console.log(`Applied Inix icon to ${path.basename(exePath)}`);
}
