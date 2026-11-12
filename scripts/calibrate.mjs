// Relative profile diagnostics only. This is not an Elo measurement.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { selectCandidate } from "../src/chess.js";
const require = createRequire(import.meta.url);
const enginePath = require("stockfish").findEngine("lite-single");
const sequence = (moves) => {
  const game = new Chess();
  moves
    .split(" ")
    .filter(Boolean)
    .forEach((move) => game.move(move));
  return game.fen();
};
const positions = [
  { name: "Opening", fen: new Chess().fen() },
  {
    name: "Italian tactics",
    fen: sequence("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 Nxe4"),
  },
  {
    name: "Queens Gambit middlegame",
    fen: sequence("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6"),
  },
  {
    name: "Sicilian middlegame",
    fen: sequence("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7"),
  },
  { name: "Rook ending", fen: "8/5pk1/6p1/3R3p/2P5/6P1/5PKP/6r1 w - - 0 35" },
  { name: "Pawn ending", fen: "8/5pk1/6p1/7p/2P5/6P1/5PKP/8 w - - 0 35" },
  { name: "Hanging queen tactic", fen: "4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1" },
];
function search(fen) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [enginePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "",
      stderr = "",
      done = false;
    const candidates = new Map();
    const timer = setTimeout(
      () => finish(new Error("Search timed out: " + stderr)),
      30000,
    );
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      error
        ? reject(error)
        : resolve([...candidates.values()].sort((a, b) => b.score - a.score));
    }
    child.on("error", finish);
    child.on("exit", (code) => {
      if (!done) finish(new Error("Engine exited " + code + ": " + stderr));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line === "uciok")
          child.stdin.write(
            `setoption name Hash value 16\nsetoption name MultiPV value ${new Chess(fen).moves().length}\nisready\n`,
          );
        if (line === "readyok")
          child.stdin.write(`position fen ${fen}\ngo depth 7 movetime 1500\n`);
        const match = line.match(
          /info depth (\d+).*?(?:multipv (\d+) )?score (cp|mate) (-?\d+).*? pv (.+)/,
        );
        if (match)
          candidates.set(Number(match[2] || 1), {
            depth: Number(match[1]),
            move: match[5].trim().split(/\s+/)[0],
            score:
              match[3] === "mate"
                ? Number(match[4]) > 0
                  ? 10000
                  : -10000
                : Number(match[4]),
          });
        if (line.startsWith("bestmove ")) finish();
      }
    });
    child.stdin.write("uci\n");
  });
}
function random(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const ratings = [700, 1000, 1300, 1600, 2000, 2400, 2700];
const samplesPerPosition = 10000;
const totals = Object.fromEntries(
  ratings.map((r) => [r, { rating: r, totalLoss: 0, best: 0, samples: 0 }]),
);
const evidence = [];
for (const position of positions) {
  const candidates = await search(position.fen);
  if (!candidates.length) throw new Error("No candidates for " + position.name);
  const legal = new Set(
    new Chess(position.fen)
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion || "")),
  );
  if (candidates.some((c) => !legal.has(c.move)))
    throw new Error("Illegal engine move in " + position.name);
  evidence.push({
    ...position,
    legalMoves: legal.size,
    returnedCandidates: candidates.length,
    candidates,
  });
  for (const rating of ratings) {
    const pool =
        rating < 1320
          ? candidates
          : rating >= 2500
            ? candidates.slice(0, 1)
            : candidates.slice(0, 8),
      rng = random(0x12345678 + rating),
      entry = totals[rating];
    for (let i = 0; i < samplesPerPosition; i++) {
      const move = selectCandidate(pool, rating, rng);
      entry.totalLoss += Math.max(0, candidates[0].score - move.score);
      entry.best += Number(move.move === candidates[0].move);
      entry.samples++;
    }
  }
}
const summary = ratings.map((r) => {
  const t = totals[r];
  return {
    rating: r,
    samples: t.samples,
    meanCentipawnLoss: Number((t.totalLoss / t.samples).toFixed(2)),
    bestMovePercent: Number(((100 * t.best) / t.samples).toFixed(2)),
  };
});
const output = {
  description:
    "Relative selection-profile diagnostics. NOT measured Elo or match calibration.",
  engine: "stockfish@19.0.1 lite-single",
  search: { depth: 7, movetime: 1500, multiPV: "all legal moves" },
  method:
    "Fixed engine candidate scores isolate profile weighting; actual app also varies search depth/time. Seeded 10,000 samples per rating per position; mate scores saturate at 10,000. Limited handcrafted positions are not a representative tournament benchmark.",
  summary,
  positions: evidence,
};
await mkdir("tests/fixtures", { recursive: true });
await writeFile(
  "tests/fixtures/calibration.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
