// Omien pelien haku: Lichessin ja Chess.comin vastausten tulkinta korvaavalla verkkokutsulla (fetch.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./harness.mjs";

const reply = (status, body) => ({
  status, ok: status < 400,
  json: async () => body,
  text: async () => body,
});

test("Lichess: tulokset, tekoälyvastustaja ja aikamuoto; muunnelmat ohitetaan", async () => {
  const lines = [
    { variant: "standard", pgn: "1. e4 *", winner: "white", status: "mate", createdAt: 0, speed: "blitz",
      players: { white: { user: { name: "Minä" }, rating: 1500 }, black: { user: { name: "Muu" }, rating: 1550 } },
      opening: { name: "King's Pawn Game" } },
    { variant: "standard", pgn: "1. d4 *", status: "draw", createdAt: 0, speed: "rapid",
      players: { white: { user: { name: "Minä" } }, black: { aiLevel: 3 } } },
    { variant: "chess960", pgn: "1. e4 *", players: { white: {}, black: {} } },
  ].map((g) => JSON.stringify(g)).join("\n");
  let url = "";
  const app = loadApp({ hosted: true, fetch: async (u) => { url = u; return reply(200, lines); } });
  const games = await app.fetchLichess("Minä");
  assert.match(url, /^https:\/\/lichess\.org\/api\/games\/user\/Min%C3%A4\?max=20/);
  assert.equal(games.length, 2);
  assert.equal(games[0].result, "1-0");
  assert.equal(games[0].opening, "King's Pawn Game");
  assert.equal(games[0].speed, "blitz");
  assert.equal(games[1].result, "1/2-1/2");
  assert.equal(games[1].black, "Lichess AI 3");
  assert.equal(games[1].speed, "pikapeli");
});

test("Lichess: tuntematon käyttäjä antaa notfound-virheen", async () => {
  const app = loadApp({ hosted: true, fetch: async () => reply(404, "") });
  await assert.rejects(app.fetchLichess("eiole"), (e) => e.kind === "notfound");
});

test("Chess.com: virheellinen kuukausi ohitetaan ja haetaan aiemmasta", async () => {
  const archives = ["https://api.chess.com/pub/player/mina/games/2026/09", "https://api.chess.com/pub/player/mina/games/2026/10"];
  const september = { games: [
    { rules: "chess", pgn: '[ECOUrl "https://www.chess.com/openings/Italian-Game-Two-Knights-Defense-4.d3"]\n\n1. e4 *',
      white: { username: "Mina", rating: 1200, result: "win" }, black: { username: "Muu", rating: 1210, result: "resigned" }, end_time: 1, time_class: "rapid" },
    { rules: "chess", pgn: "1. d4 *",
      white: { username: "Muu", result: "agreed" }, black: { username: "Mina", result: "agreed" }, end_time: 2, time_class: "blitz" },
    { rules: "chess960", pgn: "1. e4 *", white: {}, black: {}, end_time: 3 },
  ] };
  const asked = [];
  const app = loadApp({ hosted: true, fetch: async (u) => {
    asked.push(u);
    if (u.endsWith("/archives")) return reply(200, { archives });
    if (u.endsWith("/2026/10")) return reply(500, null); // kuluvan kuukauden arkisto rikki
    return reply(200, september);
  } });
  const games = await app.fetchChessCom("Mina");
  assert.equal(asked[0], "https://api.chess.com/pub/player/mina/games/archives");
  assert.deepEqual(asked.slice(1), [archives[1], archives[0]]); // uusin ensin
  assert.equal(games.length, 2);
  assert.equal(games[0].result, "1/2-1/2"); // uusin peli ensin
  assert.equal(games[1].result, "1-0");
  assert.equal(games[1].opening, "Italian Game Two Knights Defense");
  assert.equal(games[1].speed, "pikapeli");
});

test("Chess.com: jos kaikki kuukaudet epäonnistuvat, haku epäonnistuu", async () => {
  const app = loadApp({ hosted: true, fetch: async (u) =>
    (u.endsWith("/archives") ? reply(200, { archives: ["https://api.chess.com/pub/player/x/games/2026/10"] }) : reply(500, null)) });
  await assert.rejects(app.fetchChessCom("x"), (e) => e.kind === "http");
});
