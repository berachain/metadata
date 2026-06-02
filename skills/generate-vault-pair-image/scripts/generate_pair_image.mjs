#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromCwd = createRequire(path.join(process.cwd(), "package.json"));
const sharp = requireFromCwd("sharp");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) {
    args.set(key, "true");
  } else {
    args.set(key, next);
    i += 1;
  }
}

const required = ["left", "right", "out"];
for (const key of required) {
  if (!args.get(key)) {
    console.error(`Missing --${key}`);
    process.exit(1);
  }
}

const size = Number(args.get("size") ?? 1024);
const border = args.get("border") ?? "#ffffff";
const background = args.get("background") ?? "#ffffff";
const borderWidth = Number(args.get("border-width") ?? 52);
const dividerWidth = Number(args.get("divider-width") ?? 46);
const fit = args.get("fit") ?? "cover";

const leftPath = args.get("left");
const rightPath = args.get("right");
const outPath = args.get("out");

for (const input of [leftPath, rightPath]) {
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }
}

if (!["cover", "contain", "fill", "inside", "outside"].includes(fit)) {
  console.error(`Invalid --fit value: ${fit}`);
  process.exit(1);
}

const renderToken = async (input) =>
  sharp(input, { density: 2048 })
    .resize(size, size, { fit, background })
    .flatten({ background })
    .png()
    .toBuffer();

const halfMask = (side) => {
  const x = side === "left" ? 0 : size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="${x}" y="0" width="${size / 2}" height="${size}" fill="white"/></svg>`,
  );
};

const borderSvg = Buffer.from(`
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - borderWidth / 2}" fill="none" stroke="${border}" stroke-width="${borderWidth}"/>
  <line x1="${size / 2}" y1="${borderWidth / 2}" x2="${size / 2}" y2="${size - borderWidth / 2}" stroke="${border}" stroke-width="${dividerWidth}" stroke-linecap="round"/>
</svg>`);

const main = async () => {
  const left = await sharp(await renderToken(leftPath))
    .composite([{ input: halfMask("left"), blend: "dest-in" }])
    .png()
    .toBuffer();
  const right = await sharp(await renderToken(rightPath))
    .composite([{ input: halfMask("right"), blend: "dest-in" }])
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: 0, top: 0 },
      { input: borderSvg, left: 0, top: 0 },
    ])
    .flatten({ background })
    .png()
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  const stat = fs.statSync(outPath);
  console.log(`${outPath}`);
  console.log(`${meta.width}x${meta.height}, ${stat.size} bytes`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
