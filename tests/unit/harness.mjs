// Lataa sovelluksen src/js-tiedostot Noden vm-kontekstiin ilman selainta, jotta logiikkaa voi testata suoraan.
// Tiedostot ladataan build.js:n järjestyksessä yhteen näkyvyysalueeseen kuten rakennetussa sovelluksessa.
// main.js (käynnistys) jätetään pois, joten mitään ei piirretä eikä moottoria käynnistetä.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { JS_FILES } = createRequire(import.meta.url)(join(ROOT, "build.js"));
const CHESS = readFileSync(join(ROOT, "public", "chess.min.js"), "utf8");
const SOURCE = '"use strict";\n' + JS_FILES.filter((f) => f !== "main.js")
  .map((f) => readFileSync(join(ROOT, "src", "js", f), "utf8")).join("\n");

// DOM-korvike: mikä tahansa ominaisuus tai kutsu palauttaa korvikkeen. Se riittää tiedostojen alustukseen
// (elementtihaut ja tapahtumakuuntelijat), mutta testit eivät saa luottaa sen arvoihin.
const dom = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : dom),
  apply: () => dom,
  construct: () => dom,
});

// Palauttaa olion, jonka kautta sovelluksen nimiä luetaan: app.classify, app.game, app.state jne.
// hosted: true vastaa Firebase-versiota (Stockfish 19, cpScale 1), muuten artifact-versio (Stockfish 10, 0,7).
// fetch: korvaava verkkokutsu pelien hakua varten.
export function loadApp({ hosted = false, fetch } = {}) {
  const ctx = {
    console, setTimeout, clearTimeout, URL,
    document: dom,
    navigator: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {},
    requestAnimationFrame: () => 0,
    fetch: fetch || (() => Promise.reject(new Error("testeissä ei ole verkkoa"))),
  };
  ctx.window = ctx;
  if (hosted) Object.assign(ctx, { ENGINE_INFO: { name: "Stockfish 19", cpScale: 1 }, APP_HOSTED: true });
  vm.createContext(ctx);
  vm.runInContext(CHESS, ctx, { filename: "chess.min.js" });
  vm.runInContext(SOURCE, ctx, { filename: "src/js (koottu)" });
  return new Proxy({}, {
    get: (t, name) => (typeof name === "string" && name !== "then" ? vm.runInContext(name, ctx) : undefined),
  });
}

// Lyhenne: asettaa aseman arvion kuten moottorin tulos (arvo valkean näkökulmasta).
export function setEval(app, fen, v, { best = "a1a1", depth = 16, type = "cp" } = {}) {
  app.storeEval(fen, { type, v, depth, pv: [best] });
}

// Lataa pelin PGN:stä ja palauttaa sen asemat (pos[i + 1].move on siirto i).
export function positionsFrom(app, pgn) {
  if (!app.game.load_pgn(pgn, app.PGN_OPTS)) throw new Error("PGN ei latautunut: " + pgn);
  return app.positionsOf(app.mainMoves());
}
