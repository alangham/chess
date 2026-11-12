# Independent first-release review

The independent reviewer added and ran 39 automated tests, corrected defects, and inspected the application, engine, and source packaging. Browser acceptance is recorded separately by the implementation agent; this document distinguishes helper tests from UI observation.

## Acceptance checklist

### Rules and state
- [x] Rule fixtures cover pinned pieces, castling, castling through check, en passant and undo, all four promotions, checkmate, stalemate, threefold repetition, fifty moves, and insufficient material.
- [x] Side-selection helper supports White, Black, and deterministic random-side fixtures.
- [x] Undo returns control to White or Black, preserves the bot opening for Black, and restores both clocks before awarded increments.
- [x] Undo is disabled by default and requires opting in.
- [x] Saved PGN retains repetition history; invalid JSON, negative clocks, and malformed snapshots are rejected.
- [x] Standard and custom-position PGN round-trips are covered; malformed PGN is rejected.
- [x] Timeout helper covers bare kings, same-colored bishop dead positions, and mating material.
- [ ] Physical device gameplay and all possible dead-position configurations are not exhaustively tested.

### Engine and review
- [x] Real Stockfish lite-single WASM searches return legal moves for White, Black, and a promotion position under Node.
- [x] Worker protocol fixtures cover MultiPV, centipawn and mate scores, abort before/during a request, load errors, and underpromotion UCI conversion.
- [x] Terminal analysis returns a mate score for checkmate and zero for stalemate without starting a worker.
- [x] Difficulty fixtures cover stronger weighting at higher settings and deterministic GM selection.
- [x] Beginner searches request every legal candidate, rather than limiting mistakes to the best eight moves.
- [x] The interface labels ratings as estimates, not measured Elo.
- [x] Review classification thresholds and opening-name selection have automated fixtures.
- [ ] Rating calibration against independently rated opponents has not been run.
- [ ] Review accuracy against long analysis or a tactical benchmark has not been measured.

### Interface and clocks
- [x] Static review confirms all six clock controls: untimed, 3, 5, 10, 3+2, and 5+3.
- [x] Review corrected fractional elapsed-time loss before a move and guards pending interactions after pause or replay.
- [x] Review corrected stale hints after a move and capture displays after promotion/import.
- [x] Review corrected move numbering and columns for custom positions starting with Black or a later fullmove number.
- [x] Review added modal focus containment, Escape dismissal, and focus restoration.
- [x] Static review confirms hidden tabs pause the game and the About text explains this policy.
- [x] The reviewer inspected saved desktop and 390px mobile screenshots; the board and controls show no visible clipping.
- [x] The reviewer ran separate touch-drag and touch-hint/evaluation/modal browser checks at `/chess/`; both passed in Microsoft Edge.
- [x] The implementation agent reported 11 passing browser checks at `/chess/`, including offline engine play, clocks, undo, promotion, replay, review, cancellation races, timeout, viewport overflow, and persistent preferences.
- [ ] Physical touch hardware, native mobile browsers, screen readers, and audible sound output were not observed.

### Distribution
- [x] `npx vite build` passed after the first application corrections.
- [x] `npx vitest run` passed: 39 tests across two files.
- [x] The browser worker uses the unmodified lite-single filename and adjacent WASM file.
- [x] Source archive contains C++ source, Emscripten glue, build script, GPL text, and network download script at commit `8d9ca57043594a8fa6ae0b73fb685d9105bf51df`.
- [x] Source audit identified the required `nn-61e7af4bb97d.nnue` network; the final packaging includes that network, source archives, rebuild prerequisites, and SHA256 values.
- [x] Packaging includes matching app source and Workbox runtime license notices.
- [ ] The reviewer did not rebuild Stockfish from C++ or compare a rebuilt binary with the npm binary.
- [ ] Public GitHub Pages deployment was not observed by the reviewer.

## Defects corrected

1. Undo was enabled by default instead of being opt-in.
2. Black could undo the bot's first move before playing a human move.
3. Timeout handling missed same-colored bishop dead positions.
4. Stored data accepted negative clocks and malformed snapshots.
5. Terminal engine searches lost checkmate scores in review graphs.
6. Hints could complete after the human moved and highlight a stale position.
7. Captured-piece counts treated promoted pawns and missing imported pieces as captures.
8. Move execution discarded the time since the last clock tick.
9. A pending drag could execute after entering pause or replay.
10. Imported PGN outcomes did not prevent continuation of a finished game.
11. Move history assumed White always started at fullmove one.
12. Modals did not contain keyboard focus or support Escape dismissal.
13. Custom positions could receive unrelated standard opening labels.
14. Beginner searches omitted legal moves outside the best eight candidates.
15. Clock renders reparsed the full PGN repeatedly; memoization now reuses unchanged game/history data.
16. New/imported games reset mute and evaluation preferences; the current preferences now persist.
17. PGN export overwrote imported Event/White/Black metadata; the implementation agent changed export to supply defaults only for absent or unknown headers.

## Evidence and commands

- `npx vitest run tests/reviewer.test.js`: helper, rule, persistence, and worker protocol tests.
- `npx vitest run tests/engine-real.test.js`: three real single-threaded WASM searches through Node.
- `npx vitest run`: 39 passing tests on Vitest 4.1.12.
- `npx vite build`: successful Vite 7.3.8 production compilation and PWA generation.
- Read `src/App.jsx`, `src/chess.js`, `src/engine.js`, `vite.config.js`, `scripts/prepare-engine.mjs`, and generated notices.
- Listed and read the source tarball's `README.md`, `build.js`, `src/evaluate.h`, `src/Makefile`, and `scripts/net.sh`.

## Remaining release limits

Ratings remain estimates; low-level behavior is not a tournament-calibrated 700 Elo guarantee. The lite engine, fixed search budgets, and hardware affect playing strength. Opening names use a small local starter catalog. Review uses short searches and centipawn-loss thresholds. Standard chess.js draw detection does not prove every theoretically dead position. The single-player app deliberately pauses hidden tabs. Source build reproduction, native mobile browser installation, screen-reader behavior, and actual Pages hosting need separate observations.

## Relative difficulty evidence

The reviewer ran `node scripts/calibrate.mjs` with the actual lite-single engine. All 163 legal candidates across seven opening, middlegame, endgame, and tactical positions returned at depth seven. Each profile used 70,000 seeded selections. The fixture and method are in `tests/fixtures/calibration.json`; a unit test checks relative loss ordering.

| Displayed level | Mean centipawn loss | Best-move selection |
| --- | ---: | ---: |
| 700 | 108.27 | 25.85% |
| 1000 | 88.54 | 28.49% |
| 1300 | 71.83 | 30.73% |
| 1600 | 28.60 | 38.45% |
| 2000 | 19.02 | 41.87% |
| 2400 | 9.45 | 52.61% |
| GM | 0.00 | 100.00% |

This isolates selection weighting with fixed candidate scores. It does not measure Elo, tournament results, or the effect of each preset's actual search-time budget. The seven positions are not a representative tournament benchmark.

## Browser diagnostic note

A test that mixed raw CDP touch dragging and an immediate Playwright tap produced touch/pointer events on Hint but no native click. No hint worker started. CSS changes and detaching CDP did not change this result. A delayed tap produced a native click and a visible hint. Separating drag and touch-control tests into fresh browser contexts passed both checks. The application did not receive artificial duplicate touch handlers. Physical-device behavior after an immediate drag was not observed.

## Final verification handoff

- Checked: 39 core tests and 12 browser tests at `BASE_PATH=/chess/`, as reported by the implementation agent after the final preference changes.
- PASS: all 12 browser tests passed at /chess/, including metadata import/export.: The twelfth browser regression checks imported PGN metadata on export. The implementation agent will replace this line with the final result before delivery.
- After this document changes, rebuild the distribution so `app-source.tar.gz` includes the final checklist.

