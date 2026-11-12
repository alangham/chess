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
| --------------- | ------------------: | ------------------: |
| 700             |              108.27 |              25.85% |
| 1000            |               88.54 |              28.49% |
| 1300            |               71.83 |              30.73% |
| 1600            |               28.60 |              38.45% |
| 2000            |               19.02 |              41.87% |
| 2400            |                9.45 |              52.61% |
| GM              |                0.00 |             100.00% |

This isolates selection weighting with fixed candidate scores. It does not measure Elo, tournament results, or the effect of each preset's actual search-time budget. The seven positions are not a representative tournament benchmark.

## Browser diagnostic note

A test that mixed raw CDP touch dragging and an immediate Playwright tap produced touch/pointer events on Hint but no native click. No hint worker started. CSS changes and detaching CDP did not change this result. A delayed tap produced a native click and a visible hint. Separating drag and touch-control tests into fresh browser contexts passed both checks. The application did not receive artificial duplicate touch handlers. Physical-device behavior after an immediate drag was not observed.

## Initial release verification

- Checked: 39 core tests and 12 browser tests at `BASE_PATH=/chess/`, as reported by the implementation agent after the final preference changes.
- All 12 initial-release browser tests passed at /chess/, including imported PGN metadata export.
- After this document changes, rebuild the distribution so `app-source.tar.gz` includes the final checklist.

## Promotion release-blocker review — November 12, 2026

### Reproduced baseline

The independent reviewer ran the unchanged production build before the correction:

- All 32 desktop cases passed: four promotion choices, both colors, captures and noncaptures, click and drag movement.
- Four mobile board-input cases passed: tap and touch drag for a capture underpromotion in each color. Piece-choice activation used a mouse click in this first pass.
- Every matrix case checked all four selector options, an unchanged pending position, the explicit chess.js promotion property, SAN move history, a legal real-engine reply, and paired undo to the exact initial FEN.
- The timed hidden-tab regression failed: selecting Knight after a simulated visibility pause left the selector open. The 3+2 clock remained paused, but no promotion completed.
- The timeout regression failed: the game reached “Black wins on time” while the selector remained open above the game.

The visibility test dispatches the browser visibility event with document.hidden overridden. It does not switch a physical device between apps.

### Correction reviewed

The implementation routes click and drag requests through one promotion entry point. Pending promotion records the originating FEN. A selected piece must match that FEN, side to move, source, destination, and supported promotion type. Completing a valid paused promotion explicitly resumes play without charging hidden-tab time. A visible notice states this behavior. Terminal results close the selector. Other board moves are disabled while promotion is pending.

The first correction passed 39 core tests and all 50 browser tests, including the two reproduced pause/timeout regressions. A follow-up strengthened mobile coverage to activate promotion choices through touch rather than mouse clicks. Tap-to-move plus tap-choice passed for both colors. Touch-drag plus an immediate touch-choice failed for both colors. The reviewer used one CDP touch stream throughout; no mixed gesture API or delay was required. An event trace showed pointerdown, touchstart, pointerup, and touchend on the intended promotion button, but no click event. The existing click-only handler did not run. The direct touch correction passed eight focused browser tests: four true-touch capture promotion cases, moved-out and cancelled touches, keyboard Enter and Space, and duplicate compatibility-click consumption. The same touch session now performs the drag and the immediate piece-choice tap with no artificial delay. The corrected selector handles touch/pen pointer release directly, validates the initial press, movement distance and release bounds, and consumes a promotion once. Mouse clicks and keyboard activation remain supported. The final compatibility-click guard passed the full suite at BASE_PATH=/chess/: 54 browser tests, including 42 promotion regressions. The core suite passed 39 tests. The production build passed.

Review limit: browser touch emulation was checked at 390x844. Physical phone and pen input were not checked.

## Editorial redesign review — November 12, 2026

### Acceptance checklist and findings

The independent reviewer added `tests/browser/design.spec.js` and ran its 11 checks against the production build at `BASE_PATH=/chess/`. All 11 passed with `npx playwright test tests/browser/design.spec.js`.

- [x] Rendered and inspected screenshots at 1440x1000, 1024x768, 768x1024, 390x844, and 320x740. The board remains the primary element. Both clocks occupy the secondary desktop column and follow the board on mobile. No horizontal overflow occurred.
- [x] Checked square board geometry, minimum board width, readable clock sizes, and tabular clock numerals. The desktop board fits inside the initial viewport at both tested desktop sizes.
- [x] Checked the new-game, import, promotion, and engine-review views. The promotion selector shows Queen, Rook, Bishop, and Knight at 320px. Compact controls, neutral separators, cobalt accents, and text hierarchy continue across these views.
- [x] Checked loaded font faces and computed typography. A separate Chrome DevTools font audit inspected actual rendered glyph fonts in headings, clocks, primary controls, file controls, captions, branding, and footer text. Those audited glyphs use custom Inter fonts.
- [x] Cleared the browser HTTP cache and reloaded offline after the service worker took control. Inter remained loaded offline.
- [x] Checked visible text contrast at 4.5:1 for normal text and 3:1 for large text. The automated helper excludes disabled controls and SVG text; it compares each text color with its effective solid background.
- [x] Checked legal-move dots, capture rings, and keyboard focus against board squares at 3:1. Inspected SVG pieces, selected squares, check highlighting, and analysis graphics visually.
- [x] Checked visible keyboard focus, Escape dismissal, modal overflow, and narrow-screen promotion controls. The new-game dialog scrolls internally at 320x740.
- [x] Ran real-engine review of a completed four-ply game, checked four analysis rows, and inspected desktop and mobile analysis screenshots.

The first render exposed desktop board overflow: the board extended below the initial 1440x1000 and 1024x768 viewports. The implementation agent changed the desktop grid sizing and short-height spacing. The repeated viewport checks passed, and the updated screenshots show the complete board.

The initial legal-move dots and capture/focus outlines had insufficient contrast on dark squares. The implementation agent changed those indicators to opaque ink and added a contrasting halo to the hint outline. The repeated nontext contrast check passed.

Computed font-family checks initially concealed fallback glyphs. The actual-font audit found Arial for the infinity and arrow characters and Segoe UI Symbol for diagonal file-action arrows. The implementation agent replaced the visible infinity and navigation arrows with SVG and removed decorative file-action arrows. The repeated actual-font audit found only custom Inter in the audited text nodes.

### Evidence and scope

Screenshots are under `test-results/design-*.png`, including the five viewport captures, new-game/import/promotion dialogs, and desktop/mobile review. The reviewer inspected the generated screenshots rather than relying only on layout assertions. The final focused command passed 11 tests in 12.2 seconds.

The reviewer read relevant portions of `src/App.jsx`, `src/style.css`, `src/Piece.jsx`, `src/Icon.jsx`, `vite.config.js`, and `scripts/prepare-engine.mjs`. The generated third-party notice includes the Inter OFL attribution. The generated service worker includes the bundled Inter WOFF2 asset. Existing engine licensing notices remain in the distribution; this review does not establish independent legal compliance or reproduce the engine build.

Final local implementation checks passed: 39 core tests, the production build at BASE_PATH=/chess/, and all 65 browser tests. The browser suite includes 42 promotion regressions, 11 design checks, and 12 existing application checks. A source comparison confirmed the gameplay state and handler block is unchanged. Deployment is checked separately by the implementation agent.

### Limits

The review used desktop Chromium and emulated mobile viewport sizes. Physical phones, pen input, Safari, Firefox, native installation, screen readers, and live GitHub Pages were not checked in this redesign review. The contrast assertions cover the app's tested solid backgrounds and selected interaction states, not every possible composed visual state. The actual-font audit covers named visible text nodes; it does not inspect every possible imported string or non-Latin glyph.


## Mobile scrolling and terminal heading review

The independent reviewer added `tests/browser/mobile-state.spec.js`. Its 32 cases run in Chromium and mobile WebKit; one Chromium CDP touch case skips in WebKit. The acceptance checklist covers:

- Authoritative chess.js checkmate outcomes for White and Black human wins and bot wins, including a stale contradictory saved result.
- Stalemate, insufficient material, fifty-move and repetition draws; persisted timeout and resignation outcomes for both sides.
- Live transitions after White and Black checkmating moves, human timeout, bot timeout, confirmed human resignation, and a stalemate move.
- Starting a new game after each human checkmate clears the terminal heading and result.
- Reaching all header, main, and footer controls outside the board through document scrolling at 390x664, 320x568, 844x390, and 667x320. The check includes disabled controls and confirms each control's center is not obscured.
- Changing viewport height on the same loaded page before repeating control reachability, as a proxy for browser toolbar expansion and collapse.
- Inspecting html, body, #root, and main for clipping overflow or fixed positioning; checking no horizontal overflow.
- Constraining the game-settings dialog to the viewport and exposing its final action through internal scrolling; promotion choices fit both narrow portrait and short landscape viewports.
- A Chromium CDP touch swipe starting on an empty board square scrolls the document; existing promotion regressions retain touch-piece-drag coverage.

The reviewer found both `.board` and `.square` used `touch-action: none`, preventing browser scrolling from board gestures. The implementation now permits vertical panning except on a human piece that can be dragged. The reviewer read the heading helper and confirmed it consults `gameResult(game)` before the stored timeout/resignation result and side to move. The heading source is the live game, not the replay position.

The initial focused run passed 53 cases and skipped the CDP-only case in WebKit. Four WebKit scrolling checks initially failed because Playwright does not support mouse-wheel input in mobile WebKit. The reviewer changed those checks to keyboard document scrolling; all eight scrolling checks then passed across Chromium and WebKit. The complete final suite is recorded separately after the final additions and production build.

Review limits: WebKit runs on Windows with a mobile browser profile, not on a physical iPhone or actual Safari. Chromium scrolling uses wheel input and one real CDP touch stream; WebKit scrolling uses keyboard input. The tests do not reproduce Safari's dynamic toolbar, hardware notch, home indicator, on-screen keyboard, or native touch inertia. CSS safe-area declarations were inspected, but nonzero hardware insets were not observed. Physical iPhone Safari portrait and landscape acceptance remains untested.


Narrow heading follow-up: the implementation agent observed `Thinking...` expanding the 320px document to 323px. The independent reviewer added seven state-based browser cases at 320x568. They cover every requested state label, including both resignation outcomes, and check page width, heading bounds, and separation from the New game control after Inter loads. The implementation reduces the heading size only at widths up to 360px. These added cases await the final full-suite run; the reviewer did not run a separate focused command for this addition.

Final verification: `npm test` passed 39 core tests. The production build with `BASE_PATH=/chess/` passed. `BASE_PATH=/chess/ npm run test:e2e` passed 142 browser tests with one expected WebKit skip for the Chromium-only CDP gesture. This includes all 42 promotion regressions, the 11 existing design checks, and the new 39-case mobile/state matrix in both engines. All seven 320px heading cases passed without overflow or control overlap. The reviewer inspected the 320x568 and 667x320 WebKit dialog captures. Physical iPhone Safari remains untested.
