import React, { useState, useEffect, useRef, useMemo } from "react";
import { Chess } from "chess.js";
import {
  DEFAULT_SETTINGS,
  TIME_CONTROLS,
  newSession,
  fromSession,
  commitMove,
  undoSession,
  undoCount,
  gameResult,
  timeoutResult,
  difficulty,
  selectCandidate,
  classify,
  scoreLabel,
  positions,
  opening,
  material,
  saveSession,
  loadSession,
} from "./chess.js";
import { analyze, uciMove } from "./engine.js";
const GLYPHS = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  NAMES = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
function clockText(ms, untimed) {
  if (untimed) return "∞";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sound(kind) {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)(),
      o = c.createOscillator(),
      g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.frequency.value =
      kind === "end"
        ? 330
        : kind === "check"
          ? 620
          : kind === "capture"
            ? 240
            : 440;
    g.gain.setValueAtTime(0.07, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16);
    o.start();
    o.stop(c.currentTime + 0.17);
    o.onended = () => c.close();
  } catch {}
}
export default function App() {
  const [session, setSession] = useState(() => loadSession() || newSession());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [settings, setSettings] = useState(session.settings),
    [paused, setPaused] = useState(true),
    [selected, setSelected] = useState(null),
    [promotion, setPromotion] = useState(null),
    [thinking, setThinking] = useState(false),
    [error, setError] = useState(""),
    [hint, setHint] = useState(null),
    [evaluation, setEvaluation] = useState(null),
    [modal, setModal] = useState(null),
    [importText, setImportText] = useState(""),
    [review, setReview] = useState([]),
    [reviewBusy, setReviewBusy] = useState(false),
    [cursor, setCursor] = useState(null),
    [offline, setOffline] = useState(false),
    [storageError, setStorageError] = useState(false),
    [tab, setTab] = useState("moves"),
    [revision, setRevision] = useState(0);
  const actionRef = useRef(null),
    reviewRef = useRef(null),
    pointer = useRef(null),
    lastTick = useRef(performance.now());
  const game = useMemo(
      () => fromSession(session),
      [session.pgn, session.startFen],
    ),
    fen = game.fen(),
    history = useMemo(() => game.history({ verbose: true }), [game]),
    allPositions = useMemo(() => positions(game), [game]),
    replaying = cursor !== null;
  const viewGame = useMemo(
      () => (replaying ? new Chess(allPositions[cursor]) : game),
      [game, allPositions, cursor, replaying],
    ),
    turn = game.turn(),
    untimed = TIME_CONTROLS[session.settings.time][0] === 0;
  const legal = useMemo(
      () =>
        selected ? viewGame.moves({ square: selected, verbose: true }) : [],
      [selected, viewGame],
    ),
    last = replaying ? history[cursor - 1] : history.at(-1),
    materialInfo = useMemo(() => material(viewGame), [viewGame]);
  const canMove =
    !paused &&
    !session.result &&
    !replaying &&
    !reviewBusy &&
    turn === session.human;
  const playContext = useRef({ paused, replaying, reviewBusy });
  playContext.current = { paused, replaying, reviewBusy };
  const moveRows = [];
  history.forEach((move, index) => {
    const number = Number(move.before.split(" ")[5]);
    let row = moveRows.at(-1);
    if (!row || row.number !== number) {
      row = { number };
      moveRows.push(row);
    }
    row[move.color] = index;
  });
  useEffect(() => {
    if (!modal && !promotion) return;
    const previous = document.activeElement,
      dialog = document.querySelector('[role="dialog"]');
    const focusable = () => [
      ...dialog.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
      ),
    ];
    focusable()[0]?.focus();
    const handle = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setModal(null);
        setPromotion(null);
      }
      if (event.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal, !!promotion]);
  useEffect(() => {
    try {
      saveSession(session);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session]);
  useEffect(() => {
    const ready = () => setOffline(true);
    window.addEventListener("offline-ready", ready);
    navigator.serviceWorker?.ready.then(() => {
      if (navigator.serviceWorker.controller) setOffline(true);
    });
    return () => window.removeEventListener("offline-ready", ready);
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        setPaused(true);
        actionRef.current?.abort();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    lastTick.current = performance.now();
    if (paused || session.result || replaying || untimed) return;
    const id = setInterval(() => {
      const now = performance.now(),
        delta = now - lastTick.current;
      lastTick.current = now;
      setSession((s) => {
        if (s.result) return s;
        const current =
            s.pgn === session.pgn && s.startFen === session.startFen
              ? game
              : fromSession(s),
          color = current.turn(),
          clocks = {
            ...s.clocks,
            [color]: Math.max(0, s.clocks[color] - delta),
          };
        return {
          ...s,
          clocks,
          result: clocks[color] <= 0 ? timeoutResult(current, color) : s.result,
        };
      });
    }, 100);
    return () => clearInterval(id);
  }, [paused, session.result, fen, replaying, untimed]);
  function play(move) {
    try {
      const current = sessionRef.current,
        g = fromSession(current),
        context = playContext.current;
      if (
        current.result ||
        context.paused ||
        context.replaying ||
        context.reviewBusy
      )
        return;
      const color = g.turn(),
        now = performance.now(),
        elapsed =
          TIME_CONTROLS[current.settings.time][0] === 0
            ? 0
            : Math.max(0, now - lastTick.current),
        clocks = {
          ...current.clocks,
          [color]: Math.max(0, current.clocks[color] - elapsed),
        };
      lastTick.current = now;
      if (TIME_CONTROLS[current.settings.time][0] !== 0 && clocks[color] <= 0) {
        setSession({ ...current, clocks, result: timeoutResult(g, color) });
        return;
      }
      const m = g.move(move);
      actionRef.current?.abort();
      setThinking(false);
      setSession(commitMove(current, move, clocks));
      setSelected(null);
      setHint(null);
      setPromotion(null);
      if (current.settings.sound)
        sound(
          g.isGameOver()
            ? "end"
            : g.isCheck()
              ? "check"
              : m.captured
                ? "capture"
                : "move",
        );
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (
      paused ||
      session.result ||
      replaying ||
      turn === session.human ||
      reviewBusy
    )
      return;
    const controller = new AbortController();
    actionRef.current = controller;
    setThinking(true);
    setError("");
    const started = performance.now(),
      p = difficulty(session.settings.rating);
    analyze(fen, {
      ...p,
      multiPV:
        session.settings.rating < 1320
          ? game.moves().length
          : session.settings.rating >= 2500
            ? 1
            : 8,
      skill: 20,
      signal: controller.signal,
    })
      .then(async (result) => {
        const choice = selectCandidate(
          result.candidates,
          session.settings.rating,
        );
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, session.settings.delay - (performance.now() - started)),
          ),
        );
        if (controller.signal.aborted) return;
        const current = sessionRef.current;
        if (fromSession(current).fen() !== fen || current.result) return;
        play(uciMove(choice?.move || result.bestmove));
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setPaused(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setThinking(false);
      });
    return () => {
      controller.abort();
      setThinking(false);
    };
  }, [fen, paused, session.result, replaying, revision, reviewBusy]);
  useEffect(() => {
    if (
      !session.settings.evaluation ||
      thinking ||
      reviewBusy ||
      (!paused && !session.result && turn !== session.human)
    )
      return;
    const controller = new AbortController();
    analyze(viewGame.fen(), {
      depth: 12,
      movetime: 450,
      signal: controller.signal,
    })
      .then((r) => setEvaluation(r.score * (viewGame.turn() === "w" ? 1 : -1)))
      .catch(() => {});
    return () => controller.abort();
  }, [fen, cursor, session.settings.evaluation, thinking, reviewBusy, paused]);
  useEffect(
    () => () => {
      actionRef.current?.abort();
      reviewRef.current?.abort();
    },
    [],
  );
  function selectSquare(square) {
    if (!canMove) return;
    const piece = game.get(square);
    if (selected && selected !== square) {
      const moves = game
        .moves({ square: selected, verbose: true })
        .filter((m) => m.to === square);
      if (moves.length) {
        if (moves.some((m) => m.promotion)) {
          setPromotion({ from: selected, to: square });
          return;
        }
        play({ from: selected, to: square });
        return;
      }
    }
    setSelected(piece?.color === session.human ? square : null);
  }
  function cancelWork() {
    actionRef.current?.abort();
    reviewRef.current?.abort();
    setReviewBusy(false);
    setThinking(false);
    setSelected(null);
    setPromotion(null);
    setHint(null);
    setEvaluation(null);
    setError("");
    setRevision((v) => v + 1);
  }
  function nextSettings(overrides = {}) {
    return {
      ...settings,
      sound: sessionRef.current.settings.sound,
      evaluation: sessionRef.current.settings.evaluation,
      ...overrides,
    };
  }
  function start() {
    cancelWork();
    setSession(newSession(nextSettings()));
    setPaused(false);
    setCursor(null);
    setReview([]);
    setModal(null);
    setTab("moves");
  }
  function undo() {
    cancelWork();
    setSession((s) => undoSession(s));
    setCursor(null);
    setReview([]);
  }
  async function requestHint() {
    if (!canMove) return;
    actionRef.current?.abort();
    const controller = new AbortController();
    actionRef.current = controller;
    setThinking(true);
    try {
      const r = await analyze(fen, { signal: controller.signal });
      if (
        !controller.signal.aborted &&
        fromSession(sessionRef.current).fen() === fen &&
        !sessionRef.current.result &&
        !playContext.current.paused &&
        !playContext.current.replaying
      ) {
        const m = new Chess(fen).move(uciMove(r.bestmove));
        setHint(m);
        setSelected(m.from);
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (!controller.signal.aborted) setThinking(false);
    }
  }
  function exportPgn() {
    const g = fromSession(session);
    const headers = g.getHeaders();
    const defaults = {
      Event: "Quiet Knight",
      White:
        session.human === "w" ? "You" : `Stockfish ~${session.settings.rating}`,
      Black:
        session.human === "b" ? "You" : `Stockfish ~${session.settings.rating}`,
    };
    for (const [name, value] of Object.entries(defaults))
      if (!headers[name] || headers[name] === "?") g.setHeader(name, value);
    if (session.result)
      g.header(
        "Result",
        session.result.startsWith("White")
          ? "1-0"
          : session.result.startsWith("Black")
            ? "0-1"
            : "1/2-1/2",
      );
    download("quiet-knight.pgn", g.pgn(), "application/x-chess-pgn");
  }
  function importGame() {
    try {
      const g = new Chess(),
        input = importText.trim();
      if (!input) throw new Error("Paste a PGN or FEN first.");
      if (
        !input.includes("\n") &&
        input.split(/\s+/).length === 6 &&
        input.includes("/")
      )
        g.load(input);
      else g.loadPgn(input);
      const h = g.history({ verbose: true });
      cancelWork();
      const s = newSession(nextSettings({ time: "Untimed" })),
        importedResult = g.getHeaders().Result,
        ended =
          importedResult === "1-0"
            ? "White wins — imported PGN"
            : importedResult === "0-1"
              ? "Black wins — imported PGN"
              : importedResult === "1/2-1/2"
                ? "Draw — imported PGN"
                : null;
      setSession({
        ...s,
        startFen: h[0]?.before || g.fen(),
        pgn: g.pgn(),
        result: gameResult(g) || ended,
      });
      setPaused(true);
      setCursor(null);
      setReview([]);
      setModal(null);
      setImportText("");
    } catch (e) {
      setError(`Import failed: ${e.message}`);
    }
  }
  async function runReview() {
    if (!history.length) return;
    cancelWork();
    setPaused(true);
    setReview([]);
    setReviewBusy(true);
    setTab("review");
    const controller = new AbortController();
    reviewRef.current = controller;
    try {
      let before = await analyze(allPositions[0], {
        depth: 15,
        movetime: 650,
        signal: controller.signal,
      });
      for (let i = 0; i < history.length; i++) {
        const after = await analyze(allPositions[i + 1], {
            depth: 15,
            movetime: 650,
            signal: controller.signal,
          }),
          mover = history[i].color,
          best =
            before.bestmove ===
            history[i].from + history[i].to + (history[i].promotion || ""),
          loss = Math.max(0, before.score + after.score);
        let bestSan = before.bestmove;
        try {
          bestSan = new Chess(allPositions[i]).move(
            uciMove(before.bestmove),
          ).san;
        } catch {}
        const row = {
          ply: i + 1,
          moveNumber: Number(history[i].before.split(" ")[5]),
          mover,
          san: history[i].san,
          best: bestSan,
          loss,
          score: after.score * (mover === "w" ? -1 : 1),
          label: classify(loss, best),
        };
        setReview((rows) => [...rows, row]);
        before = after;
      }
      setCursor(history.length);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (!controller.signal.aborted) setReviewBusy(false);
    }
  }
  function fromPosition() {
    cancelWork();
    const s = newSession(nextSettings({ time: "Untimed" }));
    setSession({
      ...s,
      startFen: viewGame.fen(),
      result: gameResult(viewGame),
    });
    setCursor(null);
    setReview([]);
    setPaused(false);
  }
  const files = session.human === "w" ? "abcdefgh" : "hgfedcba",
    ranks =
      session.human === "w"
        ? [8, 7, 6, 5, 4, 3, 2, 1]
        : [1, 2, 3, 4, 5, 6, 7, 8];
  const playerCard = (color) => {
    const bot = color !== session.human,
      captured = history
        .slice(0, cursor ?? history.length)
        .filter((move) => move.color === color && move.captured)
        .map((move) => move.captured),
      advantage = materialInfo.advantage * (color === "w" ? 1 : -1);
    return (
      <div
        className={`player ${turn === color && !session.result ? "active" : ""}`}
      >
        <div className={`avatar ${bot ? "bot" : ""}`}>{bot ? "♞" : "♙"}</div>
        <div className="player-details">
          <strong>
            {bot ? "Stockfish" : "You"}{" "}
            <span className="tag">
              {bot
                ? session.settings.rating >= 2500
                  ? "GM"
                  : `~${session.settings.rating}`
                : color === "w"
                  ? "WHITE"
                  : "BLACK"}
            </span>
          </strong>
          <div className="captured">
            {captured.map((p, i) => (
              <span key={i}>{GLYPHS[p]}</span>
            ))}
            {advantage > 0 && <small>+{advantage}</small>}
            {!captured.length && (
              <small>
                {bot ? "Your sparring partner" : "Make your next move"}
              </small>
            )}
          </div>
        </div>
        <div
          className={`clock ${session.clocks[color] < 20000 && !untimed ? "low" : ""}`}
          aria-label={`${color === "w" ? "White" : "Black"} clock`}
        >
          {clockText(session.clocks[color], untimed)}
        </div>
      </div>
    );
  };
  return (
    <div className="app">
      <header>
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark">♞</span>
          <span>
            Quiet Knight<small>CHESS, AT YOUR PACE</small>
          </span>
        </a>
        <div className="header-right">
          <span className="local-badge">
            <i /> {offline ? "Offline ready" : "Private · on your device"}
          </span>
          <button
            className="icon-button"
            aria-label={session.settings.sound ? "Mute sound" : "Enable sound"}
            onClick={() =>
              setSession((s) => ({
                ...s,
                settings: { ...s.settings, sound: !s.settings.sound },
              }))
            }
          >
            {session.settings.sound ? "Sound on" : "Muted"}
          </button>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">A LITTLE FOCUS. A BETTER NEXT MOVE.</p>
            <h1>Your move.</h1>
          </div>
          <button className="primary" onClick={() => setModal("new")}>
            New game <span>＋</span>
          </button>
        </div>
        <div className="game-layout">
          <section className="play-area" aria-label="Chess game">
            {playerCard(session.human === "w" ? "b" : "w")}
            <div className="board-wrap">
              {session.settings.evaluation && (
                <div
                  className="eval-bar"
                  aria-label={`Evaluation ${evaluation === null ? "loading" : scoreLabel(evaluation)}`}
                >
                  <div
                    style={{
                      height: `${50 + 45 * Math.tanh((evaluation || 0) / 500)}%`,
                    }}
                  />
                </div>
              )}
              <div className="board" role="group" aria-label="Chessboard">
                {ranks.flatMap((rank, row) =>
                  [...files].map((file, col) => {
                    const square = `${file}${rank}`,
                      p = viewGame.get(square),
                      isLegal = legal.some((m) => m.to === square),
                      check =
                        p?.type === "k" &&
                        p.color === viewGame.turn() &&
                        viewGame.isCheck();
                    return (
                      <button
                        key={square}
                        data-square={square}
                        aria-label={`${square}${p ? ` ${p.color === "w" ? "white" : "black"} ${NAMES[p.type]}` : ""}`}
                        aria-pressed={selected === square}
                        className={`square ${(file.charCodeAt(0) + rank) % 2 ? "light" : "dark"} ${last && (last.from === square || last.to === square) ? "last" : ""} ${selected === square ? "selected" : ""} ${check ? "check" : ""} ${hint?.to === square ? "hint" : ""}`}
                        onClick={() => {
                          if (pointer.current?.suppress) {
                            pointer.current = null;
                            return;
                          }
                          selectSquare(square);
                        }}
                        onPointerDown={(e) => {
                          if (canMove && p?.color === session.human) {
                            pointer.current = {
                              from: square,
                              x: e.clientX,
                              y: e.clientY,
                            };
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setSelected(square);
                          }
                        }}
                        onPointerUp={(e) => {
                          const drag = pointer.current;
                          if (!drag) return;
                          if (!canMove) {
                            pointer.current = null;
                            return;
                          }
                          const target = document
                            .elementFromPoint(e.clientX, e.clientY)
                            ?.closest("[data-square]")?.dataset.square;
                          if (
                            Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >
                            8
                          ) {
                            pointer.current = { suppress: true };
                            if (target && target !== drag.from) {
                              const moves = game
                                .moves({ square: drag.from, verbose: true })
                                .filter((m) => m.to === target);
                              if (moves.length) {
                                if (moves.some((m) => m.promotion))
                                  setPromotion({ from: drag.from, to: target });
                                else play({ from: drag.from, to: target });
                              }
                            }
                          } else pointer.current = null;
                        }}
                        onPointerCancel={() => {
                          pointer.current = null;
                        }}
                      >
                        {col === 0 && <span className="rank">{rank}</span>}
                        {row === 7 && <span className="file">{file}</span>}
                        {p && (
                          <span
                            className={`piece ${p.color === "w" ? "white-piece" : "black-piece"}`}
                          >
                            {GLYPHS[p.type]}
                          </span>
                        )}
                        {isLegal && (
                          <span className={p ? "legal capture" : "legal"} />
                        )}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
            {playerCard(session.human)}
            <div className="game-status" role="status">
              <span className={`status-dot ${thinking ? "pulse" : ""}`} />
              {session.result ||
                (replaying
                  ? `Replay · position ${cursor} of ${history.length}`
                  : paused
                    ? "Game paused · take your time"
                    : thinking
                      ? "Stockfish is thinking…"
                      : turn === session.human
                        ? "Your turn. Find your next move."
                        : "Stockfish to move.")}
            </div>
            {paused && !session.result && !replaying && (
              <button
                className="primary resume"
                onClick={() => {
                  setPaused(false);
                  setError("");
                  setRevision((v) => v + 1);
                }}
              >
                {history.length ? "Resume game" : "Start playing"}{" "}
                <span>▶</span>
              </button>
            )}
            <div className="board-actions">
              <button
                disabled={
                  !session.settings.undo ||
                  !undoCount(game, session.human) ||
                  !!session.result
                }
                onClick={undo}
              >
                ↶ Undo
              </button>
              <button disabled={!canMove || thinking} onClick={requestHint}>
                ◇ Hint
              </button>
              <button
                disabled={!!session.result || replaying}
                onClick={() => setPaused((v) => !v)}
              >
                {paused ? "▶ Resume" : "Ⅱ Pause"}
              </button>
              <button
                disabled={!!session.result}
                onClick={() => setModal("resign")}
              >
                Resign
              </button>
            </div>
            {hint && (
              <p className="note">
                Try <strong>{hint.san}</strong>: {hint.from} to {hint.to}.
              </p>
            )}
            {session.settings.evaluation && (
              <p className="note">
                Engine evaluation:{" "}
                {evaluation === null ? "Calculating…" : scoreLabel(evaluation)}{" "}
                · White’s perspective
              </p>
            )}
          </section>
          <aside>
            <section className="panel game-panel">
              <div className="panel-heading">
                <span className="eyebrow">THE CURRENT GAME</span>
                <span className="time-tag">{session.settings.time}</span>
              </div>
              <h2>{opening(game)}</h2>
              <p className="muted">
                {history.length
                  ? `${Math.ceil(history.length / 2)} moves into the story`
                  : "Every game starts with a possibility."}
              </p>
              <div className="tabs">
                <button
                  className={tab === "moves" ? "chosen" : ""}
                  onClick={() => setTab("moves")}
                >
                  Moves
                </button>
                <button
                  className={tab === "review" ? "chosen" : ""}
                  onClick={() => setTab("review")}
                >
                  Review {review.length > 0 && <small>{review.length}</small>}
                </button>
              </div>
              {tab === "moves" ? (
                <div className="move-list">
                  {!history.length ? (
                    <div className="empty">
                      <span>♟</span>
                      <strong>A fresh board.</strong>
                      <p>
                        Your moves will appear here.
                        <br />
                        Play a little. Learn a little.
                      </p>
                    </div>
                  ) : (
                    moveRows.map((row) => (
                      <div className="move-row" key={row.number}>
                        <span>{row.number}.</span>
                        {["w", "b"].map((j) => {
                          const idx = row[j],
                            m = history[idx];
                          return m ? (
                            <button
                              key={j}
                              className={cursor === idx + 1 ? "current" : ""}
                              onClick={() => {
                                setPaused(true);
                                setCursor(idx + 1);
                              }}
                            >
                              {m.san}
                              <small>{review[idx]?.label}</small>
                            </button>
                          ) : (
                            <span key={j} />
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="review-content">
                  <p className="muted">A second look, one move at a time.</p>
                  {review.length > 0 && (
                    <>
                      <svg
                        className="graph"
                        viewBox="0 0 300 90"
                        role="img"
                        aria-label="Evaluation graph from White’s perspective"
                      >
                        <line
                          x1="0"
                          y1="45"
                          x2="300"
                          y2="45"
                          stroke="#b8c7bc"
                        />
                        <polyline
                          fill="none"
                          stroke="#426d59"
                          strokeWidth="2.5"
                          points={review
                            .map(
                              (r, i) =>
                                `${(i * 300) / Math.max(1, history.length - 1)},${45 - 40 * Math.tanh(r.score / 450)}`,
                            )
                            .join(" ")}
                        />
                      </svg>
                      <small>
                        Above the line favors White. Click a move to replay.
                      </small>
                    </>
                  )}
                  {review.map((r) => (
                    <button
                      className={`review-row ${cursor === r.ply ? "current" : ""}`}
                      key={r.ply}
                      onClick={() => setCursor(r.ply)}
                    >
                      <strong>
                        {r.moveNumber}
                        {r.mover === "w" ? "." : "…"} {r.san}
                      </strong>
                      <span className={r.label.toLowerCase()}>{r.label}</span>
                      <small>
                        Best: {r.best} · {scoreLabel(r.score)}
                      </small>
                    </button>
                  ))}
                  {reviewBusy ? (
                    <>
                      <p role="status">
                        Reviewing {review.length} / {history.length} moves…
                      </p>
                      <button
                        onClick={() => {
                          reviewRef.current?.abort();
                          setReviewBusy(false);
                        }}
                      >
                        Stop review
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      disabled={!history.length}
                      onClick={runReview}
                    >
                      {review.length ? "Analyze again" : "Analyze game"}
                    </button>
                  )}
                  <p className="fine-print">
                    Short engine analysis, not a verdict. Labels use centipawn
                    loss and can change with deeper analysis.
                  </p>
                </div>
              )}
              <div className="replay-controls">
                <button
                  aria-label="First position"
                  disabled={!history.length}
                  onClick={() => {
                    setPaused(true);
                    setCursor(0);
                  }}
                >
                  Ⅰ◀
                </button>
                <button
                  aria-label="Previous move"
                  disabled={!history.length || cursor === 0}
                  onClick={() => {
                    setPaused(true);
                    setCursor(Math.max(0, (cursor ?? history.length) - 1));
                  }}
                >
                  ◀
                </button>
                <button
                  aria-label="Next move"
                  disabled={cursor === null || cursor === history.length}
                  onClick={() =>
                    setCursor(Math.min(history.length, cursor + 1))
                  }
                >
                  ▶
                </button>
                <button
                  aria-label="Last position"
                  disabled={!history.length}
                  onClick={() => {
                    setPaused(true);
                    setCursor(history.length);
                  }}
                >
                  ▶Ⅰ
                </button>
              </div>
              {replaying && (
                <div className="replay-options">
                  <button onClick={() => setCursor(null)}>
                    Return to game
                  </button>
                  <button onClick={() => setModal("position")}>
                    Play from here
                  </button>
                </div>
              )}
            </section>
            <section className="panel small-panel">
              <h3>Make it your game</h3>
              <label className="toggle">
                <span>
                  Show engine evaluation
                  <small>A little perspective on the position</small>
                </span>
                <input
                  type="checkbox"
                  checked={session.settings.evaluation}
                  onChange={(e) =>
                    setSession((s) => ({
                      ...s,
                      settings: { ...s.settings, evaluation: e.target.checked },
                    }))
                  }
                />
              </label>
              <div className="file-actions">
                <button onClick={exportPgn}>Export PGN ↗</button>
                <button
                  onClick={() => {
                    setError("");
                    setModal("import");
                  }}
                >
                  Import game ↙
                </button>
              </div>
              <button
                className="text-button"
                onClick={() => download("position.fen", viewGame.fen())}
              >
                Save position as FEN
              </button>
            </section>
            <div className="quiet-note">
              <span>✧</span>
              <p>
                No account. No rush. Just chess.
                <small>
                  {storageError
                    ? "Saving unavailable. Export PGN before leaving."
                    : "Your game saves automatically on this device."}
                </small>
              </p>
            </div>
          </aside>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
      </main>
      <footer>
        <span>
          QUIET KNIGHT <span className="footer-dot">·</span> A place to think.
        </span>
        <button onClick={() => setModal("about")}>
          About & open-source licenses
        </button>
      </footer>
      {(modal || promotion) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!promotion) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              promotion
                ? "Choose promotion"
                : modal === "new"
                  ? "New game"
                  : modal
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => {
                setModal(null);
                setPromotion(null);
              }}
            >
              ×
            </button>
            {promotion ? (
              <>
                <p className="eyebrow">A WELL-EARNED UPGRADE</p>
                <h2>Choose your piece.</h2>
                <div className="promotion">
                  {["q", "r", "b", "n"].map((p) => (
                    <button
                      aria-label={`Promote to ${NAMES[p]}`}
                      key={p}
                      onClick={() => play({ ...promotion, promotion: p })}
                    >
                      {GLYPHS[p]}
                      <small>{NAMES[p]}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : modal === "new" ? (
              <>
                <p className="eyebrow">YOUR NEXT CHAPTER</p>
                <h2>Settle in for a game.</h2>
                <p className="muted">
                  Starting replaces your saved game. Export it first to keep it.
                </p>
                <label>
                  Play as
                  <select
                    value={settings.side}
                    onChange={(e) =>
                      setSettings({ ...settings, side: e.target.value })
                    }
                  >
                    <option value="w">White — move first</option>
                    <option value="b">Black — answer the opening</option>
                    <option value="random">Surprise me</option>
                  </select>
                </label>
                <label>
                  Opponent strength{" "}
                  <strong>
                    {settings.rating >= 2500 ? "GM" : `~${settings.rating}`}
                  </strong>
                  <input
                    aria-label="Opponent strength"
                    type="range"
                    min="700"
                    max="2700"
                    step="100"
                    value={settings.rating}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        rating: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <div className="range-labels">
                  <span>700 · Learning</span>
                  <span>GM · A challenge</span>
                </div>
                <p className="fine-print">
                  Estimated levels, not measured Elo. Lower levels use softer
                  move selection and deliberate mistakes.
                </p>
                <label>
                  Time control
                  <select
                    value={settings.time}
                    onChange={(e) =>
                      setSettings({ ...settings, time: e.target.value })
                    }
                  >
                    {Object.keys(TIME_CONTROLS).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Bot response pace
                  <select
                    value={settings.delay}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delay: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>Quick</option>
                    <option value={650}>Natural</option>
                    <option value={1400}>Relaxed</option>
                  </select>
                </label>
                <label className="toggle">
                  <span>
                    Allow undo
                    <small>Take back your move and the bot’s reply</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.undo}
                    onChange={(e) =>
                      setSettings({ ...settings, undo: e.target.checked })
                    }
                  />
                </label>
                <button className="primary full" onClick={start}>
                  Let’s play <span>→</span>
                </button>
              </>
            ) : modal === "import" ? (
              <>
                <h2>Bring a game along.</h2>
                <p className="muted">
                  Paste PGN or FEN. Import replaces the saved game and uses
                  untimed play.
                </p>
                <textarea
                  aria-label="PGN or FEN"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={'[Event "My game"]\n\n1. e4 e5 2. Nf3 Nc6'}
                />
                <input
                  aria-label="Open PGN file"
                  type="file"
                  accept=".pgn,.fen,.txt"
                  onChange={async (e) => {
                    const f = e.target.files[0];
                    if (f) {
                      if (f.size > 1000000) {
                        setError("Choose a file smaller than 1 MB.");
                        return;
                      }
                      setImportText(await f.text());
                    }
                  }}
                />
                <button className="primary full" onClick={importGame}>
                  Import game
                </button>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
              </>
            ) : modal === "resign" ? (
              <>
                <h2>Call it a game?</h2>
                <p className="muted">You can review every move afterward.</p>
                <button
                  className="primary full"
                  onClick={() => {
                    cancelWork();
                    setSession((s) => ({
                      ...s,
                      result: `${s.human === "w" ? "Black" : "White"} wins by resignation`,
                    }));
                    setModal(null);
                    setPaused(true);
                    setTab("review");
                  }}
                >
                  Resign game
                </button>
              </>
            ) : modal === "position" ? (
              <>
                <h2>A different continuation.</h2>
                <p className="muted">
                  This replaces your saved game with the displayed position. The
                  new game is untimed.
                </p>
                <button
                  className="primary full"
                  onClick={() => {
                    fromPosition();
                    setModal(null);
                  }}
                >
                  Play from this position
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow">BUILT IN THE OPEN</p>
                <h2>Quiet Knight</h2>
                <p>
                  A private chess companion. Games stay in your browser. Hidden
                  tabs pause the game; resume when you return.
                </p>
                <p>
                  Rules: chess.js 1.4.0, BSD-2-Clause. Engine: Stockfish.js
                  19.0.1, GPL-3.0. Interface: React, MIT. Piece symbols use your
                  device’s chess font.
                </p>
                <p>
                  This app is GPL-3.0-or-later. The engine is distributed
                  unmodified, with its corresponding source and build
                  instructions.
                </p>
                <p>
                  <a
                    href={`${import.meta.env.BASE_URL}licenses/Stockfish-GPL-3.0.txt`}
                  >
                    Stockfish license
                  </a>{" "}
                  ·{" "}
                  <a
                    href={`${import.meta.env.BASE_URL}licenses/THIRD-PARTY.txt`}
                  >
                    Third-party notices
                  </a>{" "}
                  ·{" "}
                  <a
                    href={`${import.meta.env.BASE_URL}engine/stockfish-source.tar.gz`}
                  >
                    Engine source archive
                  </a>{" "}
                  ·{" "}
                  <a
                    href={`${import.meta.env.BASE_URL}engine/nn-61e7af4bb97d.nnue`}
                  >
                    Engine neural network
                  </a>{" "}
                  ·{" "}
                  <a href={`${import.meta.env.BASE_URL}app-source.tar.gz`}>
                    App source archive
                  </a>{" "}
                  ·{" "}
                  <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">
                    Engine build instructions
                  </a>
                </p>
                <p className="fine-print">
                  Draw policy: threefold repetition and fifty moves are
                  automatic. Difficulty labels estimate relative strength; they
                  are not certified Elo ratings. Opening names cover a small
                  starter collection. Review labels reflect limited analysis.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
