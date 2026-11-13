// ---------- Siirtojen arviointi ----------
const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Sovellusversio (build.js) käyttää Stockfish 19:ää; artifact Stockfish 10:tä CDN:stä
const ENGINE = Object.assign({ name: "Stockfish 10", cpScale: 0.7 }, window.ENGINE_INFO || {});
const BG_DEPTH = 12, MIN_REVIEW_DEPTH = 8;
const QUALITY = {
  best: { label: "Paras siirto", mark: "" },
  good: { label: "Hyvä siirto", mark: "" },
  inacc: { label: "Epätarkkuus", mark: "?!" },
  mistake: { label: "Virhe", mark: "?" },
  blunder: { label: "Moka", mark: "??" }
};
const BAD = ["inacc", "mistake", "blunder"];
const evals = new Map(); // FEN -> { type, v, score, depth, best }, aina valkean näkökulmasta
const overChecked = new Set();
// ---------- Pelilinja ja selaus ----------
// game = varsinainen peli. variation = sivuvariantti, joka haarautuu pelistä kohdassa base (puolisiirtoja alusta).
// Aktiivinen linja = peli tai pelin alku + sivuvariantti. viewPly = näytettävä kohta aktiivisella linjalla (null = loppu).
let variation = null, viewPly = null;
let view = new Chess();

const startFen = () => game.header().FEN || DEFAULT_FEN;
// Pitkässä pelissä historiaa ja asemia kysytään monta kertaa jokaisella päivityksellä. Pelin muutokset
// kasvattavat versionumeroa, ja historia lasketaan uudelleen vain silloin, kun peli on oikeasti muuttunut.
let gameVer = 0;
["move", "undo", "load", "reset", "load_pgn", "clear"].forEach((k) => {
  const f = game[k];
  game[k] = function () { gameVer++; return f.apply(game, arguments); };
});
const getHeader = game.header;
game.header = function () { if (arguments.length) gameVer++; return getHeader.apply(game, arguments); };
let mmCache = { ver: -1, val: [] };
const mainMoves = () => {
  if (mmCache.ver !== gameVer) mmCache = { ver: gameVer, val: game.history({ verbose: true }) };
  return mmCache.val;
};
function activeMoves() {
  const main = mainMoves();
  return variation ? main.slice(0, variation.base).concat(variation.moves) : main;
}
const curPly = () => (viewPly === null ? activeMoves().length : viewPly);

// Linjan asemat alusta loppuun; pos[i + 1].move on siirto i. Muutama viimeisin linja pidetään muistissa.
const posCache = new Map();
function positionsOf(moves) {
  const start = startFen();
  const key = start + "|" + moves.map((m) => m.from + m.to + (m.promotion || "")).join(",");
  const hit = posCache.get(key);
  if (hit) return hit;
  const c = new Chess(start);
  const out = [{ fen: c.fen(), move: null }];
  for (const m of moves) {
    c.move({ from: m.from, to: m.to, promotion: m.promotion });
    out.push({ fen: c.fen(), move: m });
  }
  if (posCache.size >= 4) posCache.delete(posCache.keys().next().value);
  posCache.set(key, out);
  return out;
}
const positions = () => positionsOf(activeMoves());

function rebuildView() {
  const ms = activeMoves();
  if (viewPly !== null && viewPly >= ms.length) viewPly = null;
  const upto = viewPly === null ? ms.length : viewPly;
  view = new Chess(startFen());
  for (let i = 0; i < upto; i++) view.move({ from: ms[i].from, to: ms[i].to, promotion: ms[i].promotion });
}

function goTo(ply) {
  const n = activeMoves().length;
  ply = Math.max(0, Math.min(n, ply));
  viewPly = ply === n ? null : ply;
  selected = null; legalFromSel = [];
  rebuildView(); renderAll(); analyze();
}

function leaveVariation() {
  if (!variation) return;
  const base = variation.base;
  variation = null;
  goTo(base);
}

// Sivuvariantti korvaa pelin haarautumiskohdasta eteenpäin
function promoteVariation() {
  if (!variation) return;
  const moves = activeMoves(), fen = startFen(), headers = Object.assign({}, game.header());
  if (fen === DEFAULT_FEN) game.reset(); else game.load(fen);
  // pelaajat ym. tiedot säilyvät; tulos poistetaan, koska peli muuttui
  Object.keys(headers).forEach((k) => { if (!["SetUp", "FEN", "Result"].includes(k)) game.header(k, headers[k]); });
  moves.forEach((m) => game.move({ from: m.from, to: m.to, promotion: m.promotion }));
  variation = null; viewPly = null;
  save(); goTo(moves.length);
}

function storeEval(fen, l) {
  const prev = evals.get(fen);
  if (prev && prev.depth > l.depth) return;
  evals.set(fen, {
    type: l.type, v: l.v, depth: l.depth, best: l.pv[0],
    score: l.type === "mate" ? (l.v > 0 ? 10000 : -10000) : l.v
  });
}

function evalOf(fen) {
  if (evals.has(fen)) return evals.get(fen);
  if (!overChecked.has(fen)) {
    overChecked.add(fen);
    const c = new Chess(fen);
    if (c.in_checkmate()) evals.set(fen, { type: "mate", v: 0, score: c.turn() === "w" ? -10000 : 10000, depth: 99, best: null });
    else if (c.in_draw()) evals.set(fen, { type: "cp", v: 0, score: 0, depth: 99, best: null });
  }
  return evals.get(fen) || null;
}

// Voittomahdollisuus välillä -1…1 (Lichessin kaava). Stockfish 10:n sotilasyksikkö on noin 1,4-kertainen
// nykyisiin Stockfish-versioihin verrattuna, joten sen arvot skaalataan kertoimella 0,7 (ENGINE.cpScale).
const winChance = (s) => 2 / (1 + Math.exp(-0.00368208 * ENGINE.cpScale * s)) - 1;

function classify(i, pos) {
  const b = evalOf(pos[i].fen), a = evalOf(pos[i + 1].fen), m = pos[i + 1].move;
  if (!b || !a || b.depth < MIN_REVIEW_DEPTH || a.depth < MIN_REVIEW_DEPTH) return null;
  const loss = (winChance(b.score) - winChance(a.score)) * (m.color === "w" ? 1 : -1);
  const uci = m.from + m.to + (m.promotion || "");
  let kind = "good";
  if (b.best && uci === b.best) kind = "best";
  else if (loss >= 0.3) kind = "blunder";
  else if (loss >= 0.2) kind = "mistake";
  else if (loss >= 0.1) kind = "inacc";
  return { kind, loss, before: b, after: a, move: m };
}
