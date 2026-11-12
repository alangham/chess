import { Chess } from "chess.js";
// One isolated worker per request prevents stale searches from changing a newer game.
export function analyze(
  fen,
  { depth = 14, movetime = 900, multiPV = 1, skill = 20, signal } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const position = new Chess(fen);
    if (position.isCheckmate() || position.isStalemate()) {
      resolve({
        bestmove: "(none)",
        candidates: [],
        score: position.isCheckmate() ? -10000 : 0,
      });
      return;
    }
    const worker = new Worker(
      `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`,
    );
    let timer,
      finished = false;
    const lines = new Map();
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () =>
        finish(
          new Error(
            "The engine did not respond. Restart the game or reload this page.",
          ),
        ),
      30000,
    );
    worker.onerror = () =>
      finish(
        new Error(
          "Stockfish could not load. Connect once to download the offline engine.",
        ),
      );
    worker.onmessage = ({ data }) => {
      for (const line of String(data).split("\n")) {
        if (line === "uciok") {
          worker.postMessage("setoption name Hash value 16");
          worker.postMessage(`setoption name MultiPV value ${multiPV}`);
          worker.postMessage(`setoption name Skill Level value ${skill}`);
          worker.postMessage("isready");
        }
        if (line === "readyok") {
          worker.postMessage(`position fen ${fen}`);
          worker.postMessage(`go depth ${depth} movetime ${movetime}`);
        }
        const match = line.match(
          /info depth (\d+).*?(?:multipv (\d+) )?score (cp|mate) (-?\d+).*? pv (.+)/,
        );
        if (match) {
          const pv = match[5].trim().split(/\s+/);
          const score =
            match[3] === "mate"
              ? Number(match[4]) > 0
                ? 10000
                : -10000
              : Number(match[4]);
          lines.set(Number(match[2] || 1), {
            depth: Number(match[1]),
            move: pv[0],
            pv,
            score,
            mate: match[3] === "mate" ? Number(match[4]) : null,
          });
        }
        if (line.startsWith("bestmove ")) {
          const bestmove = line.split(" ")[1];
          finish(null, {
            bestmove,
            candidates: [...lines.values()],
            score: lines.get(1)?.score ?? 0,
          });
        }
      }
    };
    worker.postMessage("uci");
  });
}
export const uciMove = (uci) => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  ...(uci[4] ? { promotion: uci[4] } : {}),
});
