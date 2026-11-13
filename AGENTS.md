# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini and others) working in this repository. Human contributors will find the same information useful.

## What this is

Shakkivalmentaja is a Finnish-language chess coach that runs entirely in the browser: Stockfish (WebAssembly, in Web Workers) suggests moves, reviews games and powers practice puzzles. There is no backend. Data lives in `localStorage` and IndexedDB on the user's device. Live at https://shakkivalmentaja.web.app (Firebase Hosting).

## Commands

```sh
npm run build         # src/ → dist/shakkivalmentaja.html and public/index.html + public/sw.js
npm ci                # dev tools only (ESLint)
npm run lint          # ESLint (tools/lint.mjs); must pass
npm run test:unit     # unit tests of the app logic in Node, no browser (<1 s)
npm run test:offline  # unit tests + build + browser tests, skipping Lichess/Chess.com (~2.5 min)
npm test              # all tests, including the network test
node tests/run.mjs --only analyysi,peli   # selected suites (names are listed in tests/run.mjs)
npm run deploy        # Firebase deploy. Only when the user asks.
```

Requirements: Node 22+ and Chrome or Edge (`CHROME_PATH` if not found). The app has **no runtime dependencies**, and that is deliberate: never add one. `npm ci` installs only dev tools (ESLint).

## Architecture

```
src/index.html     page markup with build placeholders (<!-- build: ... -->)
src/styles.css     all styles
src/help.html      the help dialog (user documentation, in Finnish)
src/js/*.js        app code by feature
build.js           assembles everything; lists the JS files in order (JS_FILES)
public/            hosted assets: Stockfish 19, chess.min.js, icons, manifest
tests/             headless-Chrome tests driven over the DevTools protocol
tests/unit/        Node unit tests (node:test) that load the real src/js files in a vm
```

**The JS files are not modules.** `build.js` indents them and concatenates them, in `JS_FILES` order, into one `(function () { "use strict"; ... })()`, so all files share one scope. Consequences:

- Do not add `import`/`export`. Use the names that other files declare.
- A new file must be added to `JS_FILES` in `build.js`, at a position that fits the feature.
- Function declarations are hoisted and callable from anywhere. But `const`/`let` from a later file are in the TDZ while earlier files run their **top-level** code. Top-level code (event listeners, initial values) may only use bindings declared in the same file or in earlier files. Startup happens last, in `main.js`.
- All names are shared, so check for clashes before adding a top-level name (`grep -n "const name\|function name" src/js`).

**Two builds from one source.** The standalone `dist/shakkivalmentaja.html` loads chess.js and Stockfish 10 from cdnjs and works as a single file, for example as a claude.ai artifact. The hosted build in `build.js` injects `window.STOCKFISH_LOCAL`, `window.ENGINE_INFO` (Stockfish 19, `cpScale: 1`) and `window.APP_HOSTED`, which turns on game fetching. It also adds PWA tags, an install button and a versioned service worker. Code must work in both builds: anything that needs the network beyond cdnjs is gated on `HOSTED`.

**Key state and files:**

| Area | File | Notes |
|---|---|---|
| Global state, persistence (`save`/`restore`) | `core.js` | `localStorage["shakkivalmentaja.v1"]` |
| Game line, variations, evaluations, move classification | `game-line.js` | `evals` Map: FEN → eval, always from White's view; `classify()` uses Lichess-style win chances |
| Analysis engine | `engine.js` | `main` search for the shown position, `bg` searches fill in earlier positions to depth `BG_DEPTH` |
| Opponent engine and puzzle checking | `play.js`, `practice.js` | a second Stockfish worker |
| Game library | `library.js` | IndexedDB `shakkivalmentaja`: stores `games` and `puzzles` |
| Lessons | `tutorial.js` | `LESSONS` data at the top of the file |
| Full re-render | `main.js` | `renderAll()` |

`assistOff()` is true while a game against the computer, a puzzle or a lesson is in progress. Engine help (arrows, evaluations, analysis) must then stay hidden.

## Conventions

- **UI text is Finnish**, and so are code comments, test messages and commit messages. Match the tone of the existing text: short, plain sentences. Moves shown to users use Finnish piece letters (K, D, T, L, R; convert with `fiSan()`).
- **Help stays in sync.** When a feature changes behaviour, update `src/help.html` and, if relevant, `README.md` / `README.fi.md`.
- Plain DOM code: `$("id")` for `getElementById`, `el(tag, cls, text)` for creating elements. No frameworks, no new dependencies, no CDN except cdnjs (already used).
- Wrap every `localStorage` and IndexedDB access in try/catch. The app must keep working when storage is unavailable.
- Mobile first: the layout is tested at 412 px wide, and the layout-stability test fails if content jumps.
- Commit messages: a Finnish summary line, then a short body explaining why. Do not add AI attribution trailers (`Co-Authored-By`, "Generated with …").

## Testing

Every change must pass `npm run lint` and `npm run test:offline` before it is done. `npm run lint` checks `src/js` concatenated in build order, like the built app: it finds undefined and unused names across files and reports them at the original file and line. `npx eslint` on single `src/js` files does not work, because each file uses names from the others. Changes to game fetching must also pass `npm test`. CI (`.github/workflows/test.yml`) runs lint and the offline suite on every push.

**Unit tests** (`tests/unit/*.test.mjs`) cover the logic: move classification, win chances, accuracy, beginner-mode danger detection, moves in words, PGN parsing, library keys, the review schedule and the parsing of Lichess and Chess.com responses. `harness.mjs` loads every `src/js` file except `main.js` into a Node `vm` context in `JS_FILES` order, with chess.js and a minimal DOM stub. `loadApp()` then gives access to any top-level name (`app.classify`, `app.game` …). Each test gets a fresh app. When you change logic, add or update a unit test. Prefer pure functions that take their inputs as arguments (see `nextReview` in `practice.js`).

**Browser tests** print `ok: …` / `FAIL: …` lines and finally `ERRORS: none` (page exceptions also fail the test). See `.claude/skills/run-tests/SKILL.md` for running and debugging them, including the fact that the runner hides output from passing tests.

## Workflows (skills)

Step-by-step procedures live in `.claude/skills/*/SKILL.md`. Claude Code loads them as skills. Other agents can read them as plain Markdown.

- `run-tests`: run, read and debug the browser tests
- `add-lesson`: add a step or a topic to the Opi pelaamaan lessons
- `deploy`: publish to Firebase Hosting and verify the live site (only when the user asks)

## Gotchas

- **Engine scale:** Stockfish 10 evaluations are about 1.4× today's engines, so they are scaled by `ENGINE.cpScale` (0.7). If you change the engine, check `ENGINE_INFO` in `build.js`.
- **Lichess** returns 404 to the `HeadlessChrome` user agent. The network test overrides the user agent. **Chess.com** monthly archives can fail on their own; the fetch skips failed months.
- **Library evaluations:** `librarySave()` merges stored evaluations into memory before saving (`mergeLibraryEvals`), so that a reload never overwrites a finished analysis. Keep that order if you touch saving.
- **Service worker:** `public/sw.js` is regenerated with a new cache version on every build. Never edit it or `public/index.html` by hand (both are gitignored build output).
- **Content Security Policy:** `build.js` adds a CSP `<meta>` to the hosted page. Inline `<script>` blocks are allowed by sha256 hashes computed at build time, so they just work. Do not use `eval`, `new Function`, inline event handlers (`onclick=`) or `javascript:` URLs; they are blocked. A new external origin (API, CDN, font) must be added to the matching directive in `build.js`. Other security headers (`frame-ancestors`, `nosniff`, `Permissions-Policy` …) are in `firebase.json`. The `tietoturva` browser suite fails on any CSP violation.
- **Licensing:** the repo is GPL-3.0 because it ships Stockfish. Third-party notices are in `THIRD_PARTY_NOTICES.md`; update it if you add or upgrade a vendored file.
