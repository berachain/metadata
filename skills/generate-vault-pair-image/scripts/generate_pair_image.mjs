#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sharp = createRequire(path.join(process.cwd(), "package.json"))("sharp");
const assets = fileURLToPath(new URL("../assets/", import.meta.url));
const tokens = [];
const colors = [];
const options = new Map();
const allowed = new Set([
  "token",
  "token-background",
  "out",
  "background",
  "fit",
  "left",
  "right",
]);

async function main() {
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "");
    const value = process.argv[i + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`Invalid option or missing value: ${process.argv[i]}`);
    }
    if (key === "token") tokens.push(value);
    else if (key === "token-background") colors.push(value);
    else options.set(key, value);
  }
  if (options.has("left") || options.has("right")) {
    if (tokens.length || !options.has("left") || !options.has("right")) {
      throw new Error("Use --token inputs OR both --left and --right.");
    }
    tokens.push(options.get("left"), options.get("right"));
  }
  if (tokens.length < 1 || tokens.length > 4 || !options.has("out")) {
    throw new Error("Supply 1–4 --token inputs and --out output.png.");
  }
  if (colors.length && colors.length !== tokens.length) {
    throw new Error("Supply one --token-background per token, or omit all.");
  }
  const fallback = options.get("background") ?? "#ffffff";
  for (const color of [fallback, ...colors]) {
    if (!/^#[0-9a-f]{6}$/i.test(color))
      throw new Error("Colors must be opaque #RRGGBB values.");
  }
  const fit = options.get("fit") ?? "cover";
  if (!["cover", "contain"].includes(fit))
    throw new Error("--fit must be cover or contain.");
  const out = options.get("out");
  if (path.extname(out).toLowerCase() !== ".png")
    throw new Error("Output must be a PNG.");
  if (tokens.some((input) => path.resolve(input) === path.resolve(out))) {
    throw new Error("Output must not overwrite an input.");
  }
  const size = 1024;
  const n = tokens.length;
  // Figma's 64px masks retain their intrinsic dimensions and placement.
  const placements = {
    2: [
      [0, 0],
      [16, 4.2872],
    ],
    3: [
      [32, 16],
      [4.2872, 0],
      [0, 16],
    ],
    4: [
      [32, 32],
      [32, 0],
      [0, 0],
      [0, 32],
    ],
  };
  const backgroundFiles = {
    2: ["2-bg-b.svg", "2-bg-a.svg"],
    3: ["3-bg-c.svg", "3-bg-b.svg", "3-bg-a.svg"],
  };
  const raster = (svg) =>
    sharp(Buffer.from(svg), { density: 1152 })
      .resize(size, size)
      .png()
      .toBuffer();
  const backgrounds = [];
  const logos = [];
  for (let i = 0; i < n; i++) {
    const color = colors[i] ?? fallback;
    let bg;
    if (n === 2 || n === 3) {
      bg = fs
        .readFileSync(path.join(assets, backgroundFiles[n][i]), "utf8")
        .replace(/#[0-9a-f]{6}/gi, color);
    } else {
      const [x, y] = n === 1 ? [0, 0] : placements[n][i];
      bg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="${x}" y="${y}" width="${n === 1 ? 64 : 32}" height="${n === 1 ? 64 : 32}" fill="${color}"/></svg>`;
    }
    backgrounds.push({ input: await raster(bg) });
    let logo = await sharp(tokens[i])
      .resize(size, size, { fit, background: color })
      .flatten({ background: color })
      .png()
      .toBuffer();
    if (n > 1) {
      const [x, y] = placements[n][i];
      const source = fs.readFileSync(
        path.join(assets, `${n}-${i + 1}.svg`),
        "utf8",
      );
      const nested = source.replace("<svg ", `<svg x="${x}" y="${y}" `);
      const mask = await raster(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${nested}</svg>`,
      );
      logo = await sharp(logo)
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();
    }
    logos.push({ input: logo });
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({
    create: { width: size, height: size, channels: 3, background: fallback },
  })
    .composite([...backgrounds, ...logos])
    .flatten({ background: fallback })
    .removeAlpha()
    .png()
    .toFile(out);
  console.log(`${out}: 1024x1024, ${fs.statSync(out).size} bytes`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
