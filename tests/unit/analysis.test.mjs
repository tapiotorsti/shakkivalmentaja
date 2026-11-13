// Siirtojen luokittelu, voittotodennäköisyys ja tarkkuus (game-line.js, analysis.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, setEval, positionsFrom } from "./harness.mjs";

const PGN = "1. e4 e5 2. Nf3 Nc6";

test("voittotodennäköisyys on symmetrinen ja rajattu välille -1…1", () => {
  const app = loadApp({ hosted: true });
  assert.equal(app.winChance(0), 0);
  assert.ok(Math.abs(app.winChance(300) + app.winChance(-300)) < 1e-12);
  assert.ok(app.winChance(10000) <= 1 && app.winChance(10000) > 0.999);
  assert.ok(app.winChance(-10000) >= -1 && app.winChance(-10000) < -0.999);
  // Lichessin kaava: +1,00 sotilasta ≈ 18 % voittoetu
  assert.ok(Math.abs(app.winChance(100) - 0.18205) < 1e-4);
});

test("Stockfish 10:n arvot skaalataan kertoimella 0,7", () => {
  const sf10 = loadApp(), sf19 = loadApp({ hosted: true });
  assert.equal(sf10.ENGINE.cpScale, 0.7);
  assert.ok(Math.abs(sf10.winChance(100) - sf19.winChance(70)) < 1e-12);
});

test("siirrot luokitellaan voittotodennäköisyyden pudotuksen mukaan", () => {
  const cases = [[-40, "good"], [-80, "inacc"], [-140, "mistake"], [-250, "blunder"]];
  for (const [after, kind] of cases) {
    const app = loadApp({ hosted: true });
    const pos = positionsFrom(app, PGN);
    setEval(app, pos[0].fen, 0, { best: "d2d4" });
    setEval(app, pos[1].fen, after);
    assert.equal(app.classify(0, pos).kind, kind, `0 → ${after}`);
  }
});

test("moottorin suosittelema siirto on paras siirto", () => {
  const app = loadApp({ hosted: true });
  const pos = positionsFrom(app, PGN);
  setEval(app, pos[0].fen, 30, { best: "e2e4" });
  setEval(app, pos[1].fen, -500); // pudotuksesta riippumatta
  assert.equal(app.classify(0, pos).kind, "best");
});

test("mustan siirto arvioidaan mustan näkökulmasta", () => {
  const app = loadApp({ hosted: true });
  const pos = positionsFrom(app, PGN);
  setEval(app, pos[1].fen, 0, { best: "c7c5" });
  setEval(app, pos[2].fen, 250); // valkean etu kasvoi: mustan moka
  assert.equal(app.classify(1, pos).kind, "blunder");
  setEval(app, pos[2].fen, -250, { depth: 17 }); // mustan etu kasvoi: hyvä siirto
  assert.equal(app.classify(1, pos).kind, "good");
});

test("voitetussa asemassa +8 → +6 ei ole virhe", () => {
  const app = loadApp({ hosted: true });
  const pos = positionsFrom(app, PGN);
  setEval(app, pos[0].fen, 800, { best: "d2d4" });
  setEval(app, pos[1].fen, 600);
  assert.equal(app.classify(0, pos).kind, "good");
});

test("matti vastaan on moka", () => {
  const app = loadApp({ hosted: true });
  const pos = positionsFrom(app, PGN);
  setEval(app, pos[0].fen, 20, { best: "d2d4" });
  setEval(app, pos[1].fen, -3, { type: "mate" });
  assert.equal(app.classify(0, pos).kind, "blunder");
});

test("liian matala laskenta ei anna arviota", () => {
  const app = loadApp({ hosted: true });
  const pos = positionsFrom(app, PGN);
  setEval(app, pos[0].fen, 0, { depth: 7 });
  setEval(app, pos[1].fen, -500);
  assert.equal(app.classify(0, pos), null);
});

test("syvempi arvio korvaa matalamman, mutta ei päinvastoin", () => {
  const app = loadApp({ hosted: true });
  const fen = positionsFrom(app, PGN)[0].fen;
  setEval(app, fen, 10, { depth: 12 });
  setEval(app, fen, 50, { depth: 10 });
  assert.equal(app.evalOf(fen).v, 10);
  setEval(app, fen, 40, { depth: 18 });
  assert.equal(app.evalOf(fen).v, 40);
});

test("matti- ja pattiasemat arvioidaan ilman moottoria", () => {
  const app = loadApp({ hosted: true });
  const mated = positionsFrom(app, "1. f3 e5 2. g4 Qh4#").at(-1).fen;
  assert.equal(app.evalOf(mated).score, -10000); // valkea on matissa
  const stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
  assert.equal(app.evalOf(stalemate).score, 0);
});

test("tarkkuus: virheettömät siirrot 100 %, moka laskee keskiarvoa", () => {
  const app = loadApp({ hosted: true });
  const pos = positionsFrom(app, PGN);
  [0, 0, 0, -250, -250].forEach((v, i) => setEval(app, pos[i].fen, v));
  assert.ok(Math.abs(app.accuracyOf(pos, "b") - 100) < 0.01);
  // valkea: 100 % ja moka (pudotus 21,5 prosenttiyksikköä ≈ 37 %) → noin 68,6 %
  assert.ok(Math.abs(app.accuracyOf(pos, "w") - 68.6) < 0.5, String(app.accuracyOf(pos, "w")));
});
