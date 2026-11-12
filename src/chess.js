import { Chess } from "chess.js";
export const TIME_CONTROLS = {
  Untimed: [0, 0],
  "3 min": [180, 0],
  "5 min": [300, 0],
  "10 min": [600, 0],
  "3 + 2": [180, 2],
  "5 + 3": [300, 3],
};
export const DEFAULT_SETTINGS = {
  side: "w",
  rating: 1200,
  time: "5 + 3",
  undo: false,
  sound: true,
  evaluation: false,
  delay: 650,
};
export const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export function newSession(settings = DEFAULT_SETTINGS) {
  const human =
    settings.side === "random"
      ? Math.random() < 0.5
        ? "w"
        : "b"
      : settings.side;
  return {
    pgn: "",
    startFen: new Chess().fen(),
    human,
    settings: { ...settings },
    clocks: {
      w: TIME_CONTROLS[settings.time][0] * 1000,
      b: TIME_CONTROLS[settings.time][0] * 1000,
    },
    snapshots: [],
    result: null,
  };
}
export function fromSession(session) {
  const game = new Chess(session.startFen);
  if (session.pgn) game.loadPgn(session.pgn);
  return game;
}
export function gameResult(game) {
  if (game.isCheckmate())
    return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition";
  if (game.isDrawByFiftyMoves()) return "Draw by fifty-move rule";
  return null;
}
export function timeoutResult(game, loser) {
  if (game.isInsufficientMaterial())
    return "Draw on time — opponent cannot checkmate";
  const winner = loser === "w" ? "b" : "w";
  const pieces = game
    .board()
    .flat()
    .filter((p) => p?.color === winner);
  const enemy = game
    .board()
    .flat()
    .filter((p) => p?.color === loser && p.type !== "k");
  const minor = pieces.filter((p) => p.type !== "k");
  if (
    minor.length === 0 ||
    (enemy.length === 0 &&
      minor.length === 1 &&
      ["n", "b"].includes(minor[0].type))
  )
    return "Draw on time — opponent cannot checkmate";
  return `${winner === "w" ? "White" : "Black"} wins on time`;
}
export function undoCount(game, human) {
  const history = game.history({ verbose: true });
  const lastHuman = history.findLastIndex((move) => move.color === human);
  return lastHuman < 0 ? 0 : Math.min(2, history.length - lastHuman);
}
export function undoSession(session) {
  const game = fromSession(session);
  const count = undoCount(game, session.human);
  if (!count) return session;
  const snapshots = [...session.snapshots];
  let clocks = session.clocks;
  for (let i = 0; i < count; i++) {
    game.undo();
    clocks = snapshots.pop() || clocks;
  }
  return {
    ...session,
    pgn: game.pgn(),
    snapshots,
    clocks: { ...clocks },
    result: null,
  };
}
export function commitMove(session, move, clocks = session.clocks) {
  const game = fromSession(session);
  const color = game.turn();
  game.move(move);
  return {
    ...session,
    pgn: game.pgn(),
    snapshots: [...session.snapshots, { ...clocks }],
    clocks: {
      ...clocks,
      [color]: clocks[color] + TIME_CONTROLS[session.settings.time][1] * 1000,
    },
    result: gameResult(game),
  };
}
export function difficulty(rating) {
  const r = Number(rating);
  return {
    skill: Math.max(0, Math.min(20, Math.round((r - 700) / 100))),
    depth: r < 1100 ? 5 : r < 1600 ? 8 : r < 2200 ? 12 : 16,
    movetime: r < 1100 ? 180 : r < 1600 ? 350 : r < 2200 ? 700 : 1400,
    temperature: r >= 2500 ? 0 : Math.max(12, 220 - (r - 700) * 0.115),
    blunder: r >= 2200 ? 0 : Math.max(0.015, 0.24 - (r - 700) / 7000),
  };
}
export function selectCandidate(candidates, rating, random = Math.random) {
  if (!candidates.length) return null;
  const profile = difficulty(rating);
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  if (profile.temperature === 0) return sorted[0];
  const blunder = random() < profile.blunder;
  const weights = sorted.map((c) =>
    Math.exp(
      Math.max(
        -30,
        (c.score - sorted[0].score) / (profile.temperature * (blunder ? 3 : 1)),
      ),
    ),
  );
  let pick = random() * weights.reduce((a, b) => a + b, 0);
  return sorted.find((c, i) => (pick -= weights[i]) <= 0) || sorted[0];
}
export function classify(loss, best = false) {
  if (best) return "Best";
  if (loss < 25) return "Excellent";
  if (loss < 60) return "Good";
  if (loss < 120) return "Inaccuracy";
  if (loss < 250) return "Mistake";
  return "Blunder";
}
export function scoreLabel(cp) {
  return Math.abs(cp) >= 9900
    ? cp > 0
      ? "Mate for White"
      : "Mate for Black"
    : `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(1)}`;
}
export function positions(game) {
  const history = game.history({ verbose: true });
  return [history[0]?.before || game.fen(), ...history.map((m) => m.after)];
}
const OPENINGS = [
  ["e4", "King’s Pawn Game"],
  ["d4", "Queen’s Pawn Game"],
  ["c4", "English Opening"],
  ["Nf3", "Réti Opening"],
  ["e4 e5", "Open Game"],
  ["e4 c5", "Sicilian Defense"],
  ["e4 e6", "French Defense"],
  ["e4 c6", "Caro–Kann Defense"],
  ["e4 d5", "Scandinavian Defense"],
  ["e4 d6", "Pirc Defense"],
  ["d4 d5 c4", "Queen’s Gambit"],
  ["d4 Nf6 c4 g6", "King’s Indian Defense"],
  ["e4 e5 Nf3 Nc6 Bb5", "Ruy Lopez"],
  ["e4 e5 Nf3 Nc6 Bc4", "Italian Game"],
  ["e4 e5 Nf3 Nc6 d4", "Scotch Game"],
  ["e4 e5 Nf3 Nf6", "Petrov Defense"],
  ["d4 d5 c4 e6", "Queen’s Gambit Declined"],
  ["d4 d5 c4 c6", "Slav Defense"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", "Sicilian: Najdorf"],
];
export function opening(game) {
  const first = game.history({ verbose: true })[0];
  if (first && first.before !== new Chess().fen()) return "Custom position";
  const line = game.history().join(" ");
  return (
    OPENINGS.filter(
      ([moves]) => line === moves || line.startsWith(moves + " "),
    ).sort((a, b) => b[0].length - a[0].length)[0]?.[1] || "A new position"
  );
}
export function material(game) {
  const counts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  let advantage = 0;
  for (const p of game.board().flat().filter(Boolean)) {
    advantage += (p.color === "w" ? 1 : -1) * VALUES[p.type];
    if (p.type !== "k") counts[p.color][p.type]++;
  }
  return { counts, advantage };
}
export function saveSession(session) {
  localStorage.setItem(
    "quiet-knight-v1",
    JSON.stringify({ version: 1, session }),
  );
}
export function loadSession() {
  try {
    const data = JSON.parse(localStorage.getItem("quiet-knight-v1"));
    if (data?.version !== 1) return null;
    const s = data.session;
    if (
      !TIME_CONTROLS[s.settings.time] ||
      !["w", "b"].includes(s.human) ||
      !s.clocks ||
      !Array.isArray(s.snapshots)
    )
      return null;
    if (
      !Number.isFinite(s.clocks.w) ||
      !Number.isFinite(s.clocks.b) ||
      s.clocks.w < 0 ||
      s.clocks.b < 0
    )
      return null;
    if (
      !["w", "b", "random"].includes(s.settings.side) ||
      !Number.isFinite(Number(s.settings.rating)) ||
      Number(s.settings.rating) < 700 ||
      Number(s.settings.rating) > 3000
    )
      return null;
    if (
      !Number.isFinite(s.settings.delay) ||
      s.settings.delay < 0 ||
      s.settings.delay > 10000
    )
      return null;
    if (
      s.snapshots.some(
        (c) =>
          !c ||
          !Number.isFinite(c.w) ||
          !Number.isFinite(c.b) ||
          c.w < 0 ||
          c.b < 0,
      )
    )
      return null;
    fromSession(s);
    return s;
  } catch {
    return null;
  }
}
