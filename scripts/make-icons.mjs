// Draws the app icons from the knight in src/pieceShapes.js.
// Run `node scripts/make-icons.mjs` after changing the knight or the palette,
// then commit the files it writes to public/.
import { writeFile } from "node:fs/promises";
import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { PIECES } from "../src/pieceShapes.js";

// The tile matches the light interface; the knight uses the black piece colors.
export const PALETTE = {
  top: "#ffffff",
  bottom: "#e3e5ea",
  fill: "#555352",
  shade: "#3b3938",
  line: "#252423",
};

// Knight bounds on the 48-unit piece grid: x 7.5-40.5, y 2.7-44.
const SCALE = 1.65,
  SHIFT_X = 50 - 24 * SCALE,
  SHIFT_Y = 49 - 23.35 * SCALE;

// rounded: a tile with transparent corners for browser tabs and Android.
// Full bleed (rounded: false) for iOS, which applies its own corner mask.
export function iconSvg({ rounded = true, palette = PALETTE } = {}) {
  const { parts, lines = [], dots = [] } = PIECES.n;
  const p = palette;
  const clips = parts
    .map((d, i) => `<clipPath id="c${i}"><path d="${d}"/></clipPath>`)
    .join("");
  const forms = parts
    .map(
      (d, i) =>
        `<g clip-path="url(#c${i})"><path d="${d}" fill="${p.shade}"/>` +
        `<path d="${d}" fill="${p.fill}" transform="translate(-2.8 -1.3)"/></g>` +
        `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="1.5"/>`,
    )
    .join("");
  const strokes = lines
    .map((d) => `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="1.5"/>`)
    .join("");
  const marks = dots.map((d) => `<path d="${d}" fill="${p.line}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/>` +
    `</linearGradient>` +
    `<filter id="lift" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#1d1d1f" flood-opacity="0.3"/>` +
    `</filter>${clips}</defs>` +
    `<rect width="100" height="100"${rounded ? ' rx="22.5"' : ""} fill="url(#bg)"/>` +
    `<g filter="url(#lift)"><g transform="translate(${SHIFT_X} ${SHIFT_Y}) scale(${SCALE})"` +
    ` stroke-linecap="round" stroke-linejoin="round">${forms}${strokes}${marks}</g></g>` +
    `</svg>\n`
  );
}

// Renders an SVG string to a square PNG with a transparent background.
export async function renderPng(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent">${sized}</body>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// An ICO file whose entries hold PNG data, read by Windows Vista and later.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size % 256, at);
    header.writeUInt8(size % 256, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function main() {
  const tile = iconSvg(),
    bleed = iconSvg({ rounded: false });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const png = (svg, size) => renderPng(page, svg, size);
  await writeFile("public/icon.svg", tile);
  await writeFile("public/apple-touch-icon.png", await png(bleed, 180));
  await writeFile("public/icon-192.png", await png(tile, 192));
  await writeFile("public/icon-512.png", await png(tile, 512));
  await writeFile(
    "public/favicon.ico",
    ico([
      { size: 16, png: await png(tile, 16) },
      { size: 32, png: await png(tile, 32) },
    ]),
  );
  await browser.close();
  console.log("Wrote icon.svg, apple-touch-icon.png, icon-192.png, icon-512.png and favicon.ico.");
}

if (import.meta.url === pathToFileURL(argv[1]).href) await main();
