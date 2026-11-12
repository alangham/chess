import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { Chess } from "chess.js";
const require = createRequire(import.meta.url);
const enginePath = require("stockfish").findEngine("lite-single");
function search(fen) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [enginePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "",
      stderr = "",
      done = false;
    const timer = setTimeout(
      () => finish(new Error("Actual WASM search timed out: " + stderr)),
      20000,
    );
    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      error ? reject(error) : resolve(result);
    }
    child.on("error", finish);
    child.on("exit", (code) => {
      if (!done) finish(new Error("Engine exited " + code + ": " + stderr));
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line === "uciok")
          child.stdin.write(
            "setoption name Hash value 16\nsetoption name MultiPV value 3\nisready\n",
          );
        if (line === "readyok")
          child.stdin.write(`position fen ${fen}\ngo depth 5 movetime 150\n`);
        if (line.startsWith("bestmove ")) finish(null, line.split(" ")[1]);
      }
    });
    child.stdin.write("uci\n");
  });
}
it.each([
  new Chess().fen(),
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "7k/P7/8/8/8/8/8/7K w - - 0 1",
])(
  "actual Stockfish single-threaded WASM returns a legal move for %s",
  async (fen) => {
    const best = await search(fen);
    const game = new Chess(fen);
    expect(() =>
      game.move({
        from: best.slice(0, 2),
        to: best.slice(2, 4),
        promotion: best[4],
      }),
    ).not.toThrow();
  },
  25000,
);
