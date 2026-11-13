// PGN-tuonti, pelien tunnisteet kirjastossa ja tehtävien kertausaikataulu (pgn.js, library.js, practice.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./harness.mjs";

const MIN = 60000, DAY = 86400000;

test("PGN: kellot ja kommentit ohitetaan", () => {
  const r = loadApp().parsePgn('[Event "Test"]\n\n1. e4 {[%clk 0:05:00]} e5 2. Nf3 Nc6 *');
  assert.equal(r.error, undefined);
  assert.equal(r.plies, 4);
  assert.equal(r.multiple, false);
});

test("PGN: monesta pelistä tuodaan ensimmäinen", () => {
  const two = '[Event "A"]\n\n1. e4 e5 *\n\n[Event "B"]\n\n1. d4 d5 2. c4 *';
  const r = loadApp().parsePgn(two);
  assert.equal(r.plies, 2);
  assert.equal(r.multiple, true);
});

test("PGN: tyhjä tai virheellinen teksti antaa selkeän virheen", () => {
  const app = loadApp();
  assert.match(app.parsePgn("  ").error, /Liitä ensin peli/);
  assert.match(app.parsePgn("tämä ei ole shakkia").error, /Peliä ei voitu lukea/);
  assert.equal(app.parsePgn("﻿1. e4").plies, 1); // BOM ei haittaa
});

test("kirjaston tunniste: Lichess-peli pelinumerosta", () => {
  const app = loadApp();
  app.game.load_pgn('[Site "https://lichess.org/AbCd1234"]\n\n1. e4 e5 *');
  assert.equal(app.gameKey(), "li:AbCd1234");
});

test("kirjaston tunniste: Chess.com-peli pelinumerosta", () => {
  const app = loadApp();
  app.game.load_pgn('[Site "Chess.com"]\n[Link "https://www.chess.com/game/live/123456789"]\n\n1. e4 e5 *');
  assert.equal(app.gameKey(), "cc:123456789");
});

test("kirjaston tunniste: muu peli siirroista, otsikkotiedoista riippumatta", () => {
  const app = loadApp();
  app.game.load_pgn('[Event "A"]\n\n1. e4 e5 *');
  const a = app.gameKey();
  app.game.load_pgn('[Event "B"]\n[White "X"]\n\n1. e4 e5 *');
  assert.equal(app.gameKey(), a);
  app.game.load_pgn("1. d4 d5 *");
  assert.notEqual(app.gameKey(), a);
  assert.match(a, /^pgn:/);
});

test("kertaus: puhdas ratkaisu nostaa laatikkoa 1, 3, 7 ja 21 päivään", () => {
  const app = loadApp(), now = 1_000_000;
  let box = 0;
  for (const days of [1, 3, 7, 21, 21]) {
    const r = app.nextReview(box, true, now);
    assert.equal(r.due - now, days * DAY);
    box = r.box;
  }
  assert.equal(box, 4);
});

test("kertaus: virhe tai vihje palauttaa alkuun (10 min)", () => {
  const r = loadApp().nextReview(3, false, 0);
  assert.equal(r.box, 0);
  assert.equal(r.due, 10 * MIN);
});
