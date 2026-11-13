import { mkdir, copyFile, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
await mkdir("public/engine", { recursive: true });
await mkdir("public/licenses", { recursive: true });
for (const ext of ["js", "wasm"])
  await copyFile(
    `node_modules/stockfish/bin/stockfish-19-lite-single.${ext}`,
    `public/engine/stockfish-19-lite-single.${ext}`,
  );
await copyFile(
  "node_modules/stockfish/Copying.txt",
  "public/licenses/Stockfish-GPL-3.0.txt",
);
await copyFile("node_modules/stockfish/Copying.txt", "LICENSE");
for (const [name, url] of [
  [
    "stockfish-source.tar.gz",
    "https://codeload.github.com/nmrugg/stockfish.js/tar.gz/8d9ca57043594a8fa6ae0b73fb685d9105bf51df",
  ],
  [
    "nn-61e7af4bb97d.nnue",
    "https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue",
  ],
]) {
  const path = `public/engine/${name}`;
  try {
    await access(path);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot download ${name}`);
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
  }
}
const netHash = createHash("sha256")
  .update(await readFile("public/engine/nn-61e7af4bb97d.nnue"))
  .digest("hex");
if (!netHash.startsWith("61e7af4bb97d"))
  throw new Error("NNUE checksum mismatch");
const notices = [];
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "chess.js",
  "@fontsource-variable/inter",
  "workbox-window",
  "workbox-core",
  "workbox-routing",
  "workbox-precaching",
  "workbox-strategies",
  "workbox-expiration",
  "workbox-cacheable-response",
]) {
  const pkg = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  let license = "";
  for (const file of ["LICENSE", "LICENSE.txt", "LICENSE.md"])
    try {
      license = await readFile(`node_modules/${name}/${file}`, "utf8");
      break;
    } catch {}
  if (!license) throw new Error(`Missing license for ${name}`);
  notices.push(`${name} ${pkg.version}\n${license}`);
}
notices.push(
  "Stockfish.js 19.0.1, GPL-3.0\nUnmodified lite-single WASM build.\nExact upstream source: https://github.com/nmrugg/stockfish.js/tree/8d9ca57043594a8fa6ae0b73fb685d9105bf51df\nBuild: Emscripten 6.0.9, Node/npm, make, POSIX shell, curl/wget, sha256sum. Extract stockfish-source.tar.gz; copy nn-61e7af4bb97d.nnue into src/. Install npm dependencies from the source package. Run ./build.js --lite --single-threaded. See upstream README.md, build.js, src/Makefile and scripts/net.sh for complete build options.\nSource archive and NNUE are served beside binaries. SHA256 checksums are in ENGINE-SHA256.txt. App source is in app-source.tar.gz.",
);
await writeFile(
  "public/licenses/THIRD-PARTY.txt",
  notices.join("\n\n----------------\n\n"),
);
const hashes = {};
for (const file of [
  "stockfish-19-lite-single.js",
  "stockfish-19-lite-single.wasm",
  "stockfish-source.tar.gz",
  "nn-61e7af4bb97d.nnue",
])
  hashes[file] = createHash("sha256")
    .update(await readFile(`public/engine/${file}`))
    .digest("hex");
await writeFile(
  "public/licenses/ENGINE-SHA256.txt",
  JSON.stringify(hashes, null, 2),
);
execFileSync("tar", [
  "-czf",
  "public/app-source.tar.gz",
  "src",
  "scripts",
  "tests",
  ".github",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "playwright.config.js",
  "index.html",
  "LICENSE",
  "README.md",
  "REVIEW.md",
  "public/icon.svg",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/apple-touch-icon.png",
  "public/favicon.ico",
]);
console.log(
  "Bundled engine binaries, matching source, NNUE, app source, notices and checksums.",
);
