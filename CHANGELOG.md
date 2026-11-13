# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Accessibility

- Screen readers now hear feedback and status messages: puzzle and lesson feedback, the state of a game against the computer, and fetch, import and FEN messages (WCAG 4.1.3).
- Board squares tell screen readers the selected piece, legal moves and captures, check, the last move, the lesson goal and the puzzle hint. The board is a labelled group instead of an incomplete grid (WCAG 1.3.1, 4.1.2).
- Keyboard focus stays on the square after selecting a piece or making a move, so a game can be played with the keyboard.
- The F shortcut flips the board only when focus is on the board, so it cannot fire by accident, for example from voice dictation (WCAG 2.1.4).

## [1.0.0] – 2026-11-13

First public release. Live at https://shakkivalmentaja.web.app.

### Features

- **Engine suggestions:** Stockfish 19 (WebAssembly) shows up to three candidate moves as arrows, with an evaluation bar and a plain-language verdict.
- **Move review:** moves are classified as best, good, inaccuracy, mistake or blunder from the drop in winning chances (the Lichess win-probability model).
- **Whole-game analysis:** evaluation graph, accuracy for both players and turning points; earlier positions are evaluated in the background.
- **Your own games:** fetch recent games from Lichess and Chess.com, import PGN text or files, and explore variations without losing the game.
- **Play against the computer:** eight strength levels, with hints and takebacks. Engine help stays hidden during the game.
- **Game library:** analysed games are stored in IndexedDB with their evaluations and reopen without new analysis.
- **Practise your mistakes:** puzzles built from your own mistakes and blunders, scheduled by spaced repetition (10 min → 1 → 3 → 7 → 21 days); near-equal alternative moves are verified by the engine.
- **Beginner mode:** moves in words, warnings about pieces that can be captured, fewer numbers.
- **Learn to play:** interactive on-board lessons for every piece, special moves, check and mate.
- **Installable PWA** that works offline, and a single-file build that runs anywhere (for example as a claude.ai artifact).

### Engineering

- Code split by feature into `src/`; `build.js` produces the standalone file and the hosted PWA.
- 34 unit tests (`node:test`) that load the real source in a Node `vm`, and 10 headless-Chrome browser suites driven over the DevTools protocol without a test framework.
- ESLint checks `src/js` concatenated into one scope, as it runs in the browser, so that undefined and unused names are found across files.
- Content Security Policy with build-time script hashes, plus `frame-ancestors`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` headers.
- CI on every push: lint, unit tests and browser tests.
- Shared instructions for AI coding agents (`AGENTS.md`) and workflow skills.

### Fixed

- A finished analysis in the game library was overwritten with an almost empty one when the page was reloaded.
- Beginner mode warned that a piece defended only by the king was in danger.

[1.0.0]: https://github.com/tapiotorsti/shakkivalmentaja/releases/tag/v1.0.0
