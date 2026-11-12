import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

describe("independent chess rule acceptance fixtures", () => {
  it("rejects a move that leaves the king in check", () => {
    const game = new Chess("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
    expect(game.moves({ square: "e2" })).not.toContain("Rd2");
    expect(() => game.move({ from: "e2", to: "d2" })).toThrow();
  });
  it("allows castling and relocates the rook", () => {
    const game = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    game.move("O-O");
    expect(game.get("g1")?.type).toBe("k");
    expect(game.get("f1")?.type).toBe("r");
    expect(game.get("h1")).toBeUndefined();
  });
  it("forbids castling through an attacked square", () => {
    const game = new Chess("r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1");
    expect(game.moves()).not.toContain("O-O");
  });
  it("removes the captured pawn during en passant and restores it on undo", () => {
    const game = new Chess();
    ["e4", "a6", "e5", "d5"].forEach((move) => game.move(move));
    const before = game.fen();
    game.move("exd6");
    expect(game.get("d5")).toBeUndefined();
    expect(game.get("d6")?.color).toBe("w");
    game.undo();
    expect(game.fen()).toBe(before);
  });
  it.each(["q", "r", "b", "n"])("permits promotion to %s", (piece) => {
    const game = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    game.move({ from: "a7", to: "a8", promotion: piece });
    expect(game.get("a8")?.type).toBe(piece);
  });
  it("identifies checkmate and the side that lost", () => {
    const game = new Chess();
    ["f3", "e5", "g4", "Qh4#"].forEach((move) => game.move(move));
    expect(game.isCheckmate()).toBe(true);
    expect(game.turn()).toBe("w");
  });
  it("distinguishes stalemate from checkmate", () => {
    const game = new Chess("7k/5K2/6Q1/8/8/8/8/8 b - - 0 1");
    expect(game.isStalemate()).toBe(true);
    expect(game.isCheckmate()).toBe(false);
  });
  it("detects threefold repetition with full move history", () => {
    const game = new Chess();
    ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"].forEach((move) =>
      game.move(move),
    );
    expect(game.isThreefoldRepetition()).toBe(true);
    const resumed = new Chess();
    resumed.loadPgn(game.pgn());
    expect(resumed.isThreefoldRepetition()).toBe(true);
  });
  it("detects the fifty-move draw and insufficient material", () => {
    expect(
      new Chess("7k/8/8/8/8/8/R7/K7 w - - 100 51").isDrawByFiftyMoves(),
    ).toBe(true);
    expect(
      new Chess("7k/8/8/8/8/8/8/K7 w - - 0 1").isInsufficientMaterial(),
    ).toBe(true);
  });
  it("round-trips a nonstandard starting position in PGN", () => {
    const game = new Chess("7k/8/8/8/8/8/R7/K7 w - - 0 1");
    game.move("Ra3");
    const copy = new Chess();
    copy.loadPgn(game.pgn());
    expect(copy.fen()).toBe(game.fen());
    expect(copy.getHeaders().SetUp).toBe("1");
  });
  it("rejects malformed PGN", () => {
    expect(() => new Chess().loadPgn("1. e4 e5 2. Qz9")).toThrow();
  });
});

import { afterEach, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  TIME_CONTROLS,
  newSession,
  fromSession,
  commitMove,
  undoSession,
  undoCount,
  timeoutResult,
  gameResult,
  difficulty,
  selectCandidate,
  classify,
  positions,
  opening,
  loadSession,
  saveSession,
} from "../src/chess.js";
import { analyze, uciMove } from "../src/engine.js";

describe("independent application state acceptance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("requires opting in to undo", () =>
    expect(DEFAULT_SETTINGS.undo).toBe(false));
  it("defines all six requested clock controls", () => {
    expect(Object.values(TIME_CONTROLS)).toEqual([
      [0, 0],
      [180, 0],
      [300, 0],
      [600, 0],
      [180, 2],
      [300, 3],
    ]);
  });
  it("resolves random sides and preserves an explicitly black human", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.8);
    expect(newSession({ ...DEFAULT_SETTINGS, side: "random" }).human).toBe("b");
    expect(newSession({ ...DEFAULT_SETTINGS, side: "b" }).human).toBe("b");
  });
  it("undoes a pending human move and restores clocks before its increment", () => {
    const original = newSession({ ...DEFAULT_SETTINGS, time: "3 + 2" });
    const moved = commitMove(original, "e4", { w: 175000, b: 180000 });
    expect(moved.clocks).toEqual({ w: 177000, b: 180000 });
    const undone = undoSession(moved);
    expect(fromSession(undone).history()).toEqual([]);
    expect(undone.clocks).toEqual({ w: 175000, b: 180000 });
  });
  it("undoes a completed human and bot pair without duplicating increments", () => {
    let session = newSession({ ...DEFAULT_SETTINGS, time: "5 + 3" });
    session = commitMove(session, "e4", { w: 290000, b: 300000 });
    session = commitMove(session, "e5", { w: 293000, b: 298000 });
    session = undoSession(session);
    expect(fromSession(session).history()).toEqual([]);
    expect(session.clocks).toEqual({ w: 290000, b: 300000 });
    expect(session.snapshots).toEqual([]);
  });
  it("does not undo the bot opening before Black has played", () => {
    let session = newSession({ ...DEFAULT_SETTINGS, side: "b" });
    session = commitMove(session, "e4");
    expect(undoCount(fromSession(session), "b")).toBe(0);
    expect(undoSession(session)).toBe(session);
  });
  it("undoes the Black human and bot reply but retains the opening", () => {
    let session = newSession({ ...DEFAULT_SETTINGS, side: "b" });
    for (const move of ["e4", "e5", "Nf3"]) session = commitMove(session, move);
    expect(fromSession(undoSession(session)).history()).toEqual(["e4"]);
  });
  it("draws on timeout when the opponent has a bare king or dead bishop material", () => {
    expect(
      timeoutResult(new Chess("7k/8/8/8/8/8/R7/K7 w - - 0 1"), "w"),
    ).toMatch(/^Draw/);
    expect(
      timeoutResult(new Chess("7k/8/8/8/8/8/5b2/K1B5 w - - 0 1"), "w"),
    ).toMatch(/^Draw/);
  });
  it("awards a timeout win with mating material", () => {
    expect(timeoutResult(new Chess(), "w")).toBe("Black wins on time");
  });
  it("returns game results and replay positions", () => {
    const game = new Chess();
    ["f3", "e5", "g4", "Qh4#"].forEach((move) => game.move(move));
    expect(gameResult(game)).toBe("Black wins by checkmate");
    expect(positions(game)).toHaveLength(5);
    expect(positions(game).at(-1)).toBe(game.fen());
  });
  it("uses the longest matching opening", () => {
    const game = new Chess();
    ["e4", "e5", "Nf3", "Nc6", "Bb5"].forEach((move) => game.move(move));
    expect(opening(game)).toBe("Ruy Lopez");
  });
  it("weakens lower levels and makes GM selection deterministic", () => {
    expect(difficulty(700).temperature).toBeGreaterThan(
      difficulty(1500).temperature,
    );
    expect(difficulty(700).blunder).toBeGreaterThan(difficulty(1500).blunder);
    const choices = [
      { move: "a2a3", score: -500 },
      { move: "e2e4", score: 40 },
      { move: "d2d4", score: 35 },
    ];
    expect(selectCandidate(choices, 2700, () => 0.99).move).toBe("e2e4");
    expect(selectCandidate(choices, 700, () => 0.99).move).toBe("a2a3");
    expect(selectCandidate([], 700)).toBeNull();
  });
  it("classifies centipawn losses in the intended order", () => {
    expect([0, 30, 80, 180, 300].map((n) => classify(n))).toEqual([
      "Excellent",
      "Good",
      "Inaccuracy",
      "Mistake",
      "Blunder",
    ]);
    expect(classify(0, true)).toBe("Best");
  });
  it("resumes a saved game with repetition history intact and rejects malformed data", () => {
    let raw;
    vi.stubGlobal("localStorage", {
      setItem: (_, value) => {
        raw = value;
      },
      getItem: () => raw,
    });
    let session = newSession();
    for (const move of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"])
      session = commitMove(session, move);
    saveSession(session);
    expect(fromSession(loadSession()).isThreefoldRepetition()).toBe(true);
    raw = "{broken";
    expect(loadSession()).toBeNull();
    raw = JSON.stringify({
      version: 1,
      session: { ...session, clocks: { w: -1, b: 1 } },
    });
    expect(loadSession()).toBeNull();
    raw = JSON.stringify({
      version: 1,
      session: { ...session, snapshots: [null] },
    });
    expect(loadSession()).toBeNull();
  });
});

describe("independent engine protocol acceptance", () => {
  let workers = [];
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.messages = [];
      this.stopped = false;
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.stopped = true;
    }
    emit(data) {
      this.onmessage({ data });
    }
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    workers = [];
  });
  it("parses separate MultiPV scores and kills the worker after bestmove", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const result = analyze(new Chess().fen(), { multiPV: 3 });
    const worker = workers[0];
    worker.emit("uciok");
    worker.emit("readyok");
    expect(worker.messages).toContain("setoption name MultiPV value 3");
    worker.emit(
      "info depth 8 seldepth 12 multipv 1 score cp 32 nodes 300 pv e2e4 e7e5",
    );
    worker.emit(
      "info depth 8 seldepth 12 multipv 2 score cp 20 nodes 300 pv d2d4 d7d5",
    );
    worker.emit(
      "info depth 8 seldepth 12 multipv 3 score mate -3 nodes 300 pv b1c3",
    );
    worker.emit("bestmove e2e4 ponder e7e5");
    expect(await result).toMatchObject({
      bestmove: "e2e4",
      score: 32,
      candidates: [
        { move: "e2e4", score: 32 },
        { move: "d2d4", score: 20 },
        { move: "b1c3", score: -10000 },
      ],
    });
    expect(worker.stopped).toBe(true);
  });
  it("aborts an in-flight search and terminates its worker", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    const result = analyze(new Chess().fen(), { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].stopped).toBe(true);
  });
  it("rejects a pre-aborted request without constructing a worker", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyze(new Chess().fen(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(0);
  });
  it("reports worker loading failures", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const result = analyze(new Chess().fen());
    workers[0].onerror();
    await expect(result).rejects.toThrow("Stockfish could not load");
    expect(workers[0].stopped).toBe(true);
  });
  it("preserves all promotion choices in UCI conversion", () => {
    expect(uciMove("a7a8n")).toEqual({ from: "a7", to: "a8", promotion: "n" });
  });
});

it("engine analysis preserves a terminal mate score without starting a worker", async () => {
  const construct = vi.fn();
  vi.stubGlobal("Worker", construct);
  try {
    const game = new Chess();
    for (const move of ["f3", "e5", "g4", "Qh4#"]) game.move(move);
    expect(await analyze(game.fen())).toMatchObject({
      score: -10000,
      bestmove: "(none)",
    });
    expect(await analyze("7k/5K2/6Q1/8/8/8/8/8 b - - 0 1")).toMatchObject({
      score: 0,
    });
    expect(construct).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("does not assign a standard opening name to a custom starting position", () => {
  const game = new Chess("7k/8/8/8/8/8/4P3/K7 w - - 0 1");
  game.move("e4");
  expect(opening(game)).toBe("Custom position");
});

it('keeps relative loss monotonic across seven real-engine position fixtures',async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixture=JSON.parse(await readFile(new URL('./fixtures/calibration.json',import.meta.url),'utf8'));
  const ratings=[700,1000,1300,1600,2000,2400,2700],losses=[];
  for(const rating of ratings){let total=0,seed=0x12345678+rating;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
    for(const position of fixture.positions){const all=position.candidates,pool=rating<1320?all:rating>=2500?all.slice(0,1):all.slice(0,8);for(let n=0;n<2000;n++)total+=all[0].score-selectCandidate(pool,rating,rng).score;}
    losses.push(total);
  }
  for(let i=1;i<losses.length;i++)expect(losses[i]).toBeLessThan(losses[i-1]);
  expect(losses.at(-1)).toBe(0);
});
