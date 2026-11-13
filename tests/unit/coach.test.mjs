// Suomenkieliset siirtomerkinnät, siirrot sanoin ja uhattujen nappuloiden tunnistus (core.js, coach.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./harness.mjs";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("siirtomerkinnät käännetään suomeksi (K D T L R)", () => {
  const app = loadApp();
  const cases = { Nf3: "Rf3", "Qxe7+": "Dxe7+", "e8=Q#": "e8=D#", Bb5: "Lb5", Rxa1: "Txa1", "O-O": "O-O", Kg1: "Kg1", exd5: "exd5" };
  for (const [en, fi] of Object.entries(cases)) assert.equal(app.fiSan(en), fi, en);
});

test("siirto sanoin: tavallinen siirto", () => {
  const d = loadApp().describeMove(START, "g1f3");
  assert.equal(d.san, "Rf3");
  assert.equal(d.text, "Ratsu g1 → f3");
});

test("siirto sanoin: lyönti", () => {
  const d = loadApp().describeMove("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2", "e4d5");
  assert.equal(d.san, "exd5");
  assert.equal(d.text, "Sotilas e4 → d5, lyö sotilaan");
});

test("siirto sanoin: linnoitus", () => {
  const d = loadApp().describeMove("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1");
  assert.equal(d.san, "O-O");
  assert.match(d.text, /^Linnoitus lyhyelle puolelle/);
});

test("siirto sanoin: korotus ja shakki", () => {
  const d = loadApp().describeMove("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", "b7b8q");
  assert.equal(d.san, "b8=D+");
  assert.equal(d.text, "Sotilas b7 → b8, korottuu daamiksi, shakki");
});

test("siirto sanoin: matti", () => {
  const d = loadApp().describeMove("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2", "d8h4");
  assert.equal(d.san, "Dh4#");
  assert.equal(d.text, "Daami d8 → h4, matti!");
});

test("siirto sanoin: laiton siirto ei kaada", () => {
  const d = loadApp().describeMove(START, "e2e5");
  assert.equal(d.text, "");
});

test("vaarat: suojaamaton nappula, jonka vastustaja voi lyödä", () => {
  const d = loadApp().dangersFor("r3k3/8/8/8/R7/8/8/4K3 w - - 0 1", "w");
  assert.deepEqual({ ...d.get("a4") }, { type: "r", hanging: true, by: "r" });
});

test("vaarat: suojattu nappula, jota uhkaa samanarvoinen, ei ole vaarassa", () => {
  const d = loadApp().dangersFor("r3k3/8/8/8/R7/1K6/8/8 w - - 0 1", "w");
  assert.equal(d.has("a4"), false);
});

test("vaarat: suojattu nappula on vaarassa, jos sitä uhkaa halvempi nappula", () => {
  const d = loadApp().dangersFor("4k3/8/2n5/8/3R4/4K3/8/8 w - - 0 1", "w");
  assert.deepEqual({ ...d.get("d4") }, { type: "r", hanging: false, by: "n" });
});

test("vaarat: vain omistajan nappulat ja ei kuningasta", () => {
  const app = loadApp();
  const d = app.dangersFor("r3k3/8/8/8/R7/8/8/4K3 w - - 0 1", "b");
  assert.equal(d.has("a8"), true); // musta torni on samalla linjalla suojaamatta
  assert.equal(d.has("e8"), false);
});
