---
name: add-lesson
description: Add a step or a whole topic to the "Opi pelaamaan" (learn to play) lessons in Shakkivalmentaja. Use when the user wants new chess lessons, tasks or teaching content.
---

# Adding lesson content

Lessons are data: the `LESSONS` array at the top of `src/js/tutorial.js`. The UI, progress tracking and checking come from that data, so you usually change no code.

## Data format

```js
{ id: "r", glyph: "r", name: "Torni", sub: "suorat linjat ja lyönti", steps: [
  { fen: "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1", goal: { to: ["a4"] },
    text: "Explanation shown first.",
    task: "What the user must do now.",
    done: "Shown after solving: one extra insight." },
] }
```

- `id`: unique and stable. It is the key of the saved progress (`localStorage["shakkivalmentaja.lessons"]`), so never rename an existing one. `glyph`: piece letter for the icon (`p n b r q k`). `name` / `sub`: title and subtitle in Finnish.
- `fen`: **White always moves** (`w`). Keep positions minimal: two kings plus the pieces the lesson is about. If en passant is involved, set the en-passant square in the FEN.
- `goal`, exactly one of:
  - `uci: ["e2e4", ...]`: one of these moves, given as from + to squares (4 characters; the promotion piece is not compared)
  - `to: ["a4", ...]`: any move that lands on one of these squares (they are also marked on the board)
  - `any: true`: any legal move
  - `mate: true`: a move that gives checkmate

## Checklist

1. Check every FEN and solution with chess.js before writing them in. For example, run `node -e` with `public/chess.min.js` loaded through `vm`, or reason it through carefully. Make sure the goal is reachable in one move and that wrong-but-legal moves are actually wrong.
2. Write the texts in Finnish, in the same style as the existing ones: short sentences, `text` explains, `task` gives the instruction (name the target square), and `done` adds one useful idea.
3. Use Finnish piece names (sotilas, ratsu, lähetti, torni, daami, kuningas).
4. Update `tests/tutorial.mjs`: add the solution moves to `SOLUTIONS` (keyed by lesson `name`; `[from, to]` or `[from, to, "q"]` for promotion). If you add a topic, also update the topic count in the check "seitsemän aihetta" and in the check that all topics are marked done (currently 7).
5. If you add a new topic, update the topic list under "Opi pelaamaan" in `src/help.html`.
6. Run `node tests/run.mjs --only opetus`, then `npm run test:offline`.
