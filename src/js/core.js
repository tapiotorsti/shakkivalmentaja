const STOCKFISH_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
const STORE_KEY = "shakkivalmentaja.v1";
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FI = { Q: "D", R: "T", B: "L", N: "R" };
const ARROW_COLORS = ["--a1", "--a2", "--a3"];
const FILES = "abcdefgh";

const $ = (id) => document.getElementById(id);
const boardEl = $("board"), arrowsEl = $("arrows"), linesEl = $("lines"), movesEl = $("moves");

const game = new Chess();
const isTouch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
const state = { myColor: "w", flipped: false, onlyMine: false, depth: isTouch ? 14 : 16, multipv: 3, beginner: false, gameId: null };
let selected = null, legalFromSel = [], pendingPromo = null;

// ---------- Tallennus ----------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      pgn: tempSnap() ? tempSnap().pgn : game.pgn(),
      myColor: tempSnap() ? tempSnap().myColor : state.myColor,
      flipped: tempSnap() ? tempSnap().flipped : state.flipped,
      gameId: tempSnap() ? tempSnap().gameId : state.gameId,
      onlyMine: state.onlyMine, depth: state.depth, multipv: state.multipv, beginner: state.beginner,
      play: { active: play.active, level: play.level, human: play.human, pick: play.pick, hints: play.hints }
    }));
  } catch (e) { /* ei tallennusta, ei haittaa */ }
  scheduleLibrarySave();
}
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!s) return;
    if (s.pgn) game.load_pgn(s.pgn);
    Object.assign(state, {
      myColor: s.myColor === "b" ? "b" : "w",
      flipped: !!s.flipped,
      onlyMine: !!s.onlyMine,
      beginner: !!s.beginner,
      gameId: s.gameId || null,
      depth: Math.min(22, Math.max(8, +s.depth || state.depth)),
      multipv: [1, 2, 3].includes(+s.multipv) ? +s.multipv : 3
    });
    if (s.play) {
      play.active = !!s.play.active;
      play.level = Math.min(8, Math.max(1, +s.play.level || 3));
      play.human = s.play.human === "b" ? "b" : "w";
      play.pick = ["w", "b", "r"].includes(s.play.pick) ? s.play.pick : "w";
      play.hints = +s.play.hints || 0;
    }
  } catch (e) { /* ignore */ }
}

// ---------- Apurit ----------
const fiSan = (san) => san.replace(/[QRBN]/g, (c) => FI[c]);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function squareXY(sq) {
  const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
  return state.flipped ? { x: 7 - f + 0.5, y: r + 0.5 } : { x: f + 0.5, y: 7 - r + 0.5 };
}

function kingSquare(color) {
  for (const f of FILES) for (let r = 1; r <= 8; r++) {
    const p = view.get(f + r);
    if (p && p.type === "k" && p.color === color) return f + r;
  }
  return null;
}
