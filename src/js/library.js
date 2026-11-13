// ---------- Pelikirjasto (IndexedDB) ----------
// Tallennuspaikka: selaimen IndexedDB tällä laitteella. Jos se ei ole käytettävissä, kirjasto toimii vain muistissa.
const LIB = (() => {
  let dbp = null;
  const mem = { games: new Map(), puzzles: new Map() };
  const open = () => dbp || (dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open("shakkivalmentaja", 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("games")) db.createObjectStore("games", { keyPath: "id" });
        if (!db.objectStoreNames.contains("puzzles")) db.createObjectStore("puzzles", { keyPath: "id" });
      };
      r.onsuccess = () => {
        const db = r.result;
        // toinen välilehti päivittää tai poistaa tietokannan: suljetaan yhteys, avataan uudelleen tarvittaessa
        db.onversionchange = () => { db.close(); dbp = null; };
        resolve(db);
      };
      r.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  }));
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = async (name, mode) => { const db = await open(); return db ? db.transaction(name, mode).objectStore(name) : null; };
  return {
    persistent: async () => !!(await open()),
    async getAll(name) { const st = await store(name, "readonly"); return st ? req(st.getAll()) : [...mem[name].values()]; },
    async get(name, id) { const st = await store(name, "readonly"); return st ? req(st.get(id)) : mem[name].get(id); },
    async put(name, v) { const st = await store(name, "readwrite"); return st ? req(st.put(v)) : mem[name].set(v.id, v); },
    async del(name, id) { const st = await store(name, "readwrite"); return st ? req(st.delete(id)) : mem[name].delete(id); },
  };
})();

const newGameId = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Haetuilla peleillä tunniste palvelun pelinumerosta, jotta samaa peliä ei tallenneta kahdesti
function gameKey() {
  const h = game.header();
  const li = /lichess\.org\/([A-Za-z0-9]{8})/.exec(h.Site || "");
  if (li) return "li:" + li[1];
  const cc = /chess\.com\/game\/(?:live|daily)\/(\d+)/.exec((h.Link || "") + " " + (h.Site || ""));
  if (cc) return "cc:" + cc[1];
  const moves = mainMoves().map((m) => m.from + m.to + (m.promotion || "")).join("");
  let hash = 0;
  for (const ch of startFen() + moves) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return "pgn:" + (hash >>> 0).toString(36) + moves.length;
}

function mergeEvals(list) {
  (list || []).forEach(([fen, type, v, depth, best]) => {
    const prev = evals.get(fen);
    if (!prev || prev.depth < depth) evals.set(fen, { type, v, depth, best, score: type === "mate" ? (v > 0 ? 10000 : -10000) : v });
  });
}
async function mergeLibraryEvals(id) {
  try {
    const g = await LIB.get("games", id);
    if (g && g.evals) { mergeEvals(g.evals); anaSig = ""; scheduleRender(); }
  } catch (e) { /* ignore */ }
}

function sourceOf(h) {
  if (/lichess\.org/.test(h.Site || "")) return "Lichess";
  if (/chess\.com/.test((h.Site || "") + (h.Link || ""))) return "Chess.com";
  if (h.Event === "Harjoituspeli") return "Kone";
  return "Oma";
}
function resultOfGame() {
  const r = game.header().Result;
  if (RESULTS.includes(r)) return r;
  if (game.in_checkmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.in_draw() || game.in_stalemate()) return "1/2-1/2";
  return "*";
}

let libTimer = null, libSig = "";
let libDeletedPgn = null; // laudalla oleva poistettu peli tallennetaan uudelleen vasta, kun siihen tulee siirtoja
function scheduleLibrarySave() {
  if (libTimer) return; // korkeintaan kerran 1,5 sekunnissa
  libTimer = setTimeout(() => { libTimer = null; librarySave().catch(() => {}); }, 1500);
}

async function librarySave() {
  if (practice.active || tutorial.active) return;
  const moves = mainMoves();
  if (moves.length < 4) return;
  if (!state.gameId) state.gameId = gameKey();
  const pos = positionsOf(moves);
  const ev = [];
  pos.forEach((p) => { const e = evals.get(p.fen); if (e && e.depth >= MIN_REVIEW_DEPTH && e.depth < 99) ev.push([p.fen, e.type, e.v, e.depth, e.best]); });
  const target = Math.min(BG_DEPTH, state.depth);
  const complete = pos.every((p) => { const e = evalOf(p.fen); return e && e.depth >= target; });
  const me = state.myColor;
  const results = [];
  for (let i = 0; i < pos.length - 1; i++) results.push(classify(i, pos));
  const counts = { blunder: 0, mistake: 0, inacc: 0 };
  results.forEach((r, i) => { if (r && r.kind in counts && pos[i + 1].move.color === me) counts[r.kind]++; });
  const pgn = game.pgn();
  if (libDeletedPgn !== null) { if (pgn === libDeletedPgn) return; libDeletedPgn = null; }
  const sig = [state.gameId, pgn.length, ev.length, me, complete].join("|");
  if (sig === libSig) return;
  const h = game.header();
  const old = await LIB.get("games", state.gameId);
  const entry = {
    id: state.gameId, pgn, myColor: me,
    white: playerName("w"), black: playerName("b"), wElo: h.WhiteElo || "", bElo: h.BlackElo || "",
    result: resultOfGame(), date: h.Date && !/\?/.test(h.Date) ? h.Date : today(), source: sourceOf(h),
    plies: moves.length, complete, acc: complete ? accuracyOf(pos, me) : null, counts, evals: ev,
    created: old ? old.created : Date.now(), updated: Date.now()
  };
  await LIB.put("games", entry);
  libSig = sig;
  // tehtävät vain valmiista analyysista ja päättyneistä peleistä konetta vastaan
  if (complete && !(play.active && !playOver())) await derivePuzzles(entry, pos, results);
  if (activeTab === "games") refreshLibraryUI();
}

async function derivePuzzles(entry, pos, results) {
  const old = new Map((await LIB.getAll("puzzles")).filter((p) => p.gameId === entry.id).map((p) => [p.id, p]));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || !["mistake", "blunder"].includes(r.kind) || r.move.color !== entry.myColor || !r.before.best) continue;
    const id = entry.id + ":" + i;
    const prev = old.get(id);
    await LIB.put("puzzles", Object.assign({ box: 0, due: Date.now(), attempts: 0, solved: 0, created: Date.now() }, prev || {}, {
      id, gameId: entry.id, fen: pos[i].fen, best: r.before.best, beforeScore: r.before.score, kind: r.kind,
      played: fiSan(r.move.san), label: moveLabel(pos, i), color: r.move.color,
      opp: entry.myColor === "w" ? entry.black : entry.white, date: entry.date
    }));
  }
}

// ---------- Pelit-välilehti ----------
let libEdit = false;
const fmtDate = (d) => { const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(d || ""); return m ? +m[3] + "." + +m[2] + "." + m[1] : d || ""; };

async function refreshLibraryUI() {
  renderLessonList();
  let games = [], puzzles = [];
  try { [games, puzzles] = await Promise.all([LIB.getAll("games"), LIB.getAll("puzzles")]); } catch (e) { /* ignore */ }
  const now = Date.now();
  const due = puzzles.filter((p) => p.due <= now).length;

  // harjoituskortti
  const card = $("prCard");
  card.replaceChildren();
  if (!puzzles.length) {
    card.append(el("p", "big", "Ei vielä tehtäviä"),
      el("p", "hint", "Kun analysoit pelejäsi, virheistäsi ja mokistasi tulee tänne tehtäviä. Hae omat pelisi Lisää-välilehdeltä tai pelaa konetta vastaan."));
  } else {
    const next = puzzles.filter((p) => p.due > now).sort((a, b) => a.due - b.due)[0];
    card.append(el("p", "big", due ? due + " tehtävää odottaa" : "Kaikki tehtävät tehty toistaiseksi"),
      el("p", "hint", puzzles.length + " tehtävää " + new Set(puzzles.map((p) => p.gameId)).size + " pelistä." +
        (!due && next ? " Seuraava kertaus " + new Date(next.due).toLocaleString("fi-FI", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + "." : "")));
    const row = el("div", "row");
    const b = el("button", "btn primary", "Aloita harjoitus");
    b.type = "button"; b.disabled = !due;
    b.addEventListener("click", startPractice);
    row.appendChild(b);
    card.appendChild(row);
  }

  // kirjasto
  const list = $("libList");
  list.replaceChildren();
  games.sort((a, b) => b.updated - a.updated);
  $("libEdit").hidden = !games.length;
  $("libEdit").textContent = libEdit ? "Valmis" : "Muokkaa";
  $("libNote").textContent = games.length ? "" : "Kirjasto on tyhjä. Pelit tallentuvat tänne automaattisesti, kun niissä on vähintään neljä puolisiirtoa.";
  games.forEach((g) => {
    const mine = g.myColor === "w" ? "1-0" : "0-1";
    let res = "–", cls = "";
    if (g.result === "1/2-1/2") res = "Tasan";
    else if (g.result === mine) { res = "Voitto"; cls = "win"; }
    else if (RESULTS.includes(g.result)) { res = "Tappio"; cls = "loss"; }
    const opp = g.myColor === "w" ? { name: g.black, elo: g.bElo } : { name: g.white, elo: g.wElo };
    const wrap = el("div", "librow");
    const b = el("button", "grow");
    b.type = "button";
    const o = el("span", "opp");
    o.append((g.myColor === "w" ? "Valkeilla" : "Mustilla") + " vs " + opp.name + " ");
    if (opp.elo) o.appendChild(el("small", null, String(opp.elo)));
    const bits = [fmtDate(g.date), g.source];
    bits.push(g.complete && g.acc != null ? "tarkkuus " + Math.round(g.acc) + " %" : "analyysi kesken");
    if (g.counts && (g.counts.blunder || g.counts.mistake)) bits.push(g.counts.blunder + " ?? · " + g.counts.mistake + " ?");
    b.append(el("span", "res " + cls, res), o, el("span", "meta", bits.join(" · ")));
    b.addEventListener("click", () => openLibraryGame(g.id));
    wrap.appendChild(b);
    if (libEdit) {
      const d = el("button", "btn quiet del", "Poista");
      d.type = "button"; d.setAttribute("aria-label", "Poista peli vs " + opp.name);
      d.addEventListener("click", () => deleteLibraryGame(g.id));
      wrap.appendChild(d);
    }
    list.appendChild(wrap);
  });
}
$("libEdit").addEventListener("click", () => { libEdit = !libEdit; refreshLibraryUI(); });

async function openLibraryGame(id) {
  const g = await LIB.get("games", id);
  if (!g) return;
  if (assistOff() && play.active) { playMsg("Peli konetta vastaan on kesken. Lopeta tai luovuta se ensin.", true); setTab("now"); return; }
  stopPlayMode();
  game.load_pgn(g.pgn, PGN_OPTS);
  mergeEvals(g.evals);
  state.gameId = g.id;
  state.myColor = g.myColor; state.flipped = g.myColor === "b";
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  anaSig = ""; libSig = "";
  syncSettingsUI(); save(); rebuildView(); renderAll(); analyze();
  setTab("ana");
}

async function deleteLibraryGame(id) {
  await LIB.del("games", id);
  const puzzles = (await LIB.getAll("puzzles")).filter((p) => p.gameId === id);
  for (const p of puzzles) await LIB.del("puzzles", p.id);
  if (state.gameId === id) { state.gameId = newGameId(); libSig = ""; libDeletedPgn = game.pgn(); } // nykyinen peli tallentuu uutena vasta, jos sitä jatketaan
  refreshLibraryUI();
}
