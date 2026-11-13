# Quiet Knight

A local-first chess app built with React, Vite, chess.js and Stockfish 19 WASM. No account, backend, API key, CDN, or cross-origin isolation headers are needed at runtime.

## Run locally

Requires Node.js 22.12+ and npm. Run in this directory:

1. `npm ci`
2. `npm run build`
3. `npm run dev`

Open the URL printed by Vite. The build step prepares engine/license assets. For production/offline testing use `npm run preview` after the build. PWA caching is enabled in production only. The first build downloads matching Stockfish source and NNUE for redistribution; subsequent builds reuse local copies.

## Included

- White, black, random side; approximate 700–GM strength; configurable response delay.
- Untimed, 3/5/10 minutes, 3+2, 5+3; clocks pause when the tab is hidden and on reload.
- Opt-in paired undo; hints; optional evaluation; pointer drag and click/tap movement; keyboard-accessible squares.
- Legal moves, promotion, castling, en passant, check, checkmate, stalemate, repetition, fifty-move draws, insufficient material, timeout, resignation.
- Move list, captured pieces, material balance, opening names, automatic save/resume, PGN and FEN import/export.
- Per-move engine analysis, best moves, centipawn-loss classifications, evaluation graph, replay, play from position.
- Responsive layout, generated sounds/mute, offline service worker and install manifest.

## Check

- `npm test`: independent rule/state and mocked-worker tests; actual WASM integration searches.
- `npm run test:e2e`: production browser tests. On Windows uses installed Microsoft Edge. Linux CI installs Chromium.
- `npm audit --omit=dev`: runtime dependency advisories.

See REVIEW.md for the independent acceptance checklist and observed limitations.

## GitHub Pages deployment

1. Create a public GitHub repository for this project.
2. Add these files to its `main` branch. Exclude `node_modules`, `dist`, generated public engine/licenses/source archives, and test outputs.
3. In the repository, open Settings > Pages > Build and deployment > Source, and choose GitHub Actions.
4. Push `main`, or run the `Test and deploy to GitHub Pages` workflow from Actions.
5. Open the URL reported by the `deploy` job.

The workflow tests and builds before deploying. It sets BASE_PATH to `/repository-name/`, or `/` for a `*.github.io` repository. For a custom domain, change the workflow BASE_PATH to `/` and configure the domain in Pages. For a local subpath check in PowerShell: set `$env:BASE_PATH='/chess/'`, run `npm run build`, and run `npm run test:e2e`. Do not run a production server with a different base than its build.

No remote repository or live deployment is assumed by this checkout. GitHub repository creation and a push require your account/repository selection.

## Engine strength and review limits

The labels are relative estimated levels, not measured Elo. Below 1320, Stockfish scores all legal candidates; a temperature-weighted distribution and increasing blunder probability weaken play. Higher presets use narrower candidate sets and deeper/longer searches. GM uses the strongest available short search. Machine speed changes strength. No claim of tournament or chess.com rating equivalence is made. Match-based calibration remains future work.

Analysis uses short searches per position. Classifications use centipawn loss: Best if the engine move matches, Excellent below 25, Good below 60, Inaccuracy below 120, Mistake below 250, otherwise Blunder. Mate scores saturate at 10000. Scores can differ with deeper searches. Opening lookup is a starter collection, not a full ECO database.

Threefold repetition and fifty-move draws apply automatically, without a claim button. This casual-play policy is stated in the app. `chess.js` detects standard insufficient material; it does not solve arbitrary dead positions. Timeout uses available material heuristics, not exhaustive reachability. Games pause on hidden tabs by design; this is a practice app, not competitive clock enforcement.

## Licensing and source

Application code is GPL-3.0-or-later. See LICENSE. React/react-dom/scheduler are MIT; chess.js is BSD-2-Clause. Stockfish.js is GPL-3.0 and is bundled unchanged as a separate single-threaded worker.

`npm run build` distributes:

- `engine/stockfish-19-lite-single.js` and `.wasm`, copied unchanged from pinned `stockfish@19.0.1`.
- `engine/stockfish-source.tar.gz`, exact upstream commit `8d9ca57043594a8fa6ae0b73fb685d9105bf51df`, tag `v19.0.1`.
- `engine/nn-61e7af4bb97d.nnue`, the required lite network, checked against the upstream SHA256 prefix.
- `licenses/Stockfish-GPL-3.0.txt`, third-party notices, build instructions and SHA256 values.
- `app-source.tar.gz`, the corresponding app source and build configuration.

About provides source/license links. Preserve these files and access when redistributing. To rebuild the engine, use Emscripten 6.0.9, Node/npm, make, a POSIX shell, curl/wget and sha256sum. Extract source, copy the NNUE to `src/`, install its dependencies, and run `./build.js --lite --single-threaded`. Follow the archived README/build.js/Makefile for complete options. The app build uses upstream prebuilt binaries; an engine rebuild was not performed during app development.

Typography uses locally bundled Inter through @fontsource-variable/inter 5.3.0 under the SIL Open Font License, including offline font caching and notices. Chess pieces are original inline SVG artwork. No third-party artwork or sound recordings are included.

## Relative-strength evidence

`npm run calibrate` runs the real engine on seven recorded positions and measures seeded move selection from those candidate scores. The recorded mean loss decreases from 108.27 centipawns at the 700 preset to 9.45 at 2400 and 0 at GM. Each preset samples 70,000 choices. See `tests/fixtures/calibration.json` for positions, candidate scores, and limits. This measures profile weighting only; it is not match-based Elo calibration. A regression test checks the relative ordering.

## Development advisory status

Runtime auditing returned zero advisories. A full audit retained five low/moderate entries in the Workbox build dependency chain after compatible updates. The affected build tools are not shipped as runtime application modules. Run `npm audit` to get the current advisory details before changing dependency versions.

## Visual system

The interface follows Apple platform conventions: local Inter typography with its Display optical size for large headings, a light gray page with white rounded cards, a silver-gray board with a soft shadow, pill buttons, a segmented Moves/Review control, iOS-style switches, and dialogs that become bottom sheets on phones. `src/style.css` owns reusable color, type, radius, shadow, focus, and interaction tokens. At widths of 960px and above, the board occupies the left track and clocks, controls, evaluation, and the game record occupy the right track. Desktop width also accounts for viewport height so the complete board stays visible at the tested sizes. Narrower layouts stack the board before the secondary modules. `src/Piece.jsx` and `src/Icon.jsx` provide original SVG artwork without glyph-font fallback. The piece outlines live in `src/pieceShapes.js`. `node scripts/make-icons.mjs` draws the favicon, the Apple touch icon, and the manifest icons from the same knight and writes them to `public/`. Run it again after changing the knight or the icon palette.

### Color themes

The header sun/moon button switches between coordinated light and dark themes. The first visit follows `prefers-color-scheme`; an explicit choice is saved separately from the game in `quiet-knight-theme`. The synchronous bootstrap in `index.html` applies the theme before application styles and rendering. Device changes continue to apply until the user chooses a theme. If browser storage is unavailable, switching still works for the current page.
