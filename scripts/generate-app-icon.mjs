import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = path.join(root, "public", "logo.png");
const outPath = path.join(root, "public", "icon.png");

const SIZE = 512;
const LOGO_SCALE = 1.82;
const BLACK_THRESHOLD = 36;

function readPng(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on("parsed", function onParsed() {
        resolve(this);
      })
      .on("error", reject);
  });
}

function writePng(filePath, png) {
  return new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(fs.createWriteStream(filePath))
      .on("finish", resolve)
      .on("error", reject);
  });
}

function isKeyedOut(r, g, b, a) {
  if (a === 0) return true;
  return r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD;
}

function sample(src, sx, sy) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(sy)));
  const i = (y0 * src.width + x0) * 4;
  return {
    r: src.data[i],
    g: src.data[i + 1],
    b: src.data[i + 2],
    a: src.data[i + 3] ?? 255,
  };
}

async function buildIcon() {
  if (!fs.existsSync(logoPath)) {
    console.error(`Missing ${logoPath}`);
    process.exit(1);
  }

  const src = await readPng(logoPath);
  const out = new PNG({ width: SIZE, height: SIZE, colorType: 6, inputHasAlpha: true });
  out.data.fill(0);

  const drawW = SIZE * LOGO_SCALE;
  const drawH = (src.height / src.width) * drawW;
  const offsetX = (SIZE - drawW) / 2;
  const offsetY = (SIZE - drawH) / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = ((x - offsetX) * src.width) / drawW;
      const sy = ((y - offsetY) * src.height) / drawH;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;

      const { r, g, b, a } = sample(src, sx, sy);
      if (isKeyedOut(r, g, b, a)) continue;

      const oi = (y * SIZE + x) * 4;
      out.data[oi] = r;
      out.data[oi + 1] = g;
      out.data[oi + 2] = b;
      out.data[oi + 3] = 255;
    }
  }

  await writePng(outPath, out);
  console.log(`App icon PNG written to ${outPath} (transparent RGBA)`);
}

await buildIcon();
