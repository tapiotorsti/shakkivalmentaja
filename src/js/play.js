// ---------- Peli konetta vastaan ----------
// Vastustaja on oma Stockfish-instanssinsa, jonka vahvuutta rajoitetaan Skill Level -asetuksella ja syvyydellä.
// Analyysimoottori laskee pelin aikana taustalla, mutta sen tulokset näytetään vasta pelin päätyttyä.
const LEVELS = [
  { name: "Aloittelija", skill: 0, depth: 1 },
  { name: "Vasta-alkaja", skill: 3, depth: 2 },
  { name: "Satunnainen pelaaja", skill: 6, depth: 4 },
  { name: "Harrastaja", skill: 9, depth: 6 },
  { name: "Kerhopelaaja", skill: 12, depth: 8 },
  { name: "Vahva kerhopelaaja", skill: 15, depth: 10 },
  { name: "Mestaritaso", skill: 18, depth: 13 },
  { name: "Täysi voima", skill: 20, depth: 16 }
];
const RESULTS = ["1-0", "0-1", "1/2-1/2"];
const play = { active: false, level: 3, human: "w", pick: "w", hints: 0, thinking: false, token: 0, hintFen: null };
const playOver = () => game.game_over() || RESULTS.includes(game.header().Result);
const assistOff = () => (play.active && !playOver()) || (practice.active && !practice.resolved) || tutorial.active;
const levelLabel = (lv) => "Stockfish taso " + lv + " (" + LEVELS[lv - 1].name + ")";
let opp = null, oppJob = null, oppIgnore = 0;

function makeWorker() {
  if (window.STOCKFISH_LOCAL) return new Worker(window.STOCKFISH_LOCAL);
  const blob = new Blob(['importScripts("' + STOCKFISH_URL + '");'], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function playMsg(text, err) { const m = $("playMsg"); m.textContent = text || ""; m.className = "msg" + (err ? " err" : ""); }

function oppEngine() {
  if (opp) return opp;
  try { opp = makeWorker(); } catch (e) { playMsg("Vastustajan moottoria ei voitu käynnistää.", true); return null; }
  opp.onmessage = (e) => onOppLine(String(e.data));
  opp.onerror = () => playMsg("Vastustajan moottorin lataus epäonnistui – tarkista verkkoyhteys.", true);
  opp.postMessage("uci");
  return opp;
}

function maybeEngineMove() {
  if (!play.active || playOver() || game.turn() === play.human || play.thinking) return;
  const w = oppEngine();
  if (!w) return;
  const L = LEVELS[play.level - 1];
  play.thinking = true;
  oppJob = { token: ++play.token, fen: game.fen(), start: Date.now() };
  w.postMessage("setoption name Skill Level value " + L.skill);
  w.postMessage("position fen " + oppJob.fen);
  w.postMessage("go depth " + L.depth);
  renderPlay();
}

function onOppLine(line) {
  if (line.startsWith("bestmove") && oppIgnore > 0) { oppIgnore--; return; } // peruttu haku
  if (evalJob) { onEvalLine(line); return; }
  if (!line.startsWith("bestmove")) return;
  const job = oppJob;
  oppJob = null;
  if (!job) return;
  const uci = line.split(/\s+/)[1];
  const wait = Math.max(0, 600 - (Date.now() - job.start)); // pieni tauko, ettei vastaus tule välittömästi
  setTimeout(() => {
    if (job.token !== play.token) return;
    play.thinking = false;
    if (!play.active || game.fen() !== job.fen || !uci || uci === "(none)") { renderPlay(); return; }
    game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    afterMainMove();
  }, wait);
}

function cancelOppMove() {
  if (oppJob && opp) { oppIgnore++; opp.postMessage("stop"); }
  oppJob = null;
  play.token++;
  play.thinking = false;
}

// Pelin siirron jälkeen: tulos talteen, näkymä päivitykseen ja tarvittaessa koneen vuoro
function afterMainMove() {
  if (play.active && game.game_over() && !RESULTS.includes(game.header().Result)) {
    game.header("Result", game.in_checkmate() ? (game.turn() === "w" ? "0-1" : "1-0") : "1/2-1/2");
  }
  play.hintFen = null;
  save(); rebuildView(); renderAll(); analyze();
  maybeEngineMove();
}

function today() {
  const d = new Date();
  return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
}

function startPlay() {
  if (practice.active) { practice.active = false; practice.puzzle = null; practice.snapshot = null; }
  if (tutorial.active) { tutorial.active = false; tutorial.snapshot = null; }
  cancelOppMove();
  state.gameId = newGameId();
  const human = play.pick === "r" ? (Math.random() < 0.5 ? "w" : "b") : play.pick;
  Object.assign(play, { active: true, human, hints: 0, hintFen: null });
  game.reset();
  const bot = levelLabel(play.level);
  game.header("Event", "Harjoituspeli", "Date", today(),
    "White", human === "w" ? "Sinä" : bot, "Black", human === "b" ? "Sinä" : bot, "Result", "*");
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  state.myColor = human; state.flipped = human === "b";
  syncSettingsUI();
  if (oppEngine()) opp.postMessage("ucinewgame");
  playMsg("");
  save(); rebuildView(); renderAll(); analyze();
  setTab("now");
  maybeEngineMove();
}

function stopPlayMode() {
  cancelOppMove();
  play.active = false; play.hintFen = null;
  if (practice.active) { practice.active = false; practice.puzzle = null; practice.snapshot = null; }
  if (tutorial.active) { tutorial.active = false; tutorial.snapshot = null; }
}

// Peru oma siirto ja koneen vastaus
function takeback() {
  cancelOppMove();
  if (RESULTS.includes(game.header().Result)) game.header("Result", "*");
  game.undo();
  while (game.history().length && game.turn() !== play.human) game.undo();
  viewPly = null; selected = null; legalFromSel = []; play.hintFen = null;
  save(); rebuildView(); renderAll(); analyze();
  maybeEngineMove();
}

function resultInfo() {
  const r = game.header().Result;
  if (!RESULTS.includes(r)) return null;
  let how = "luovutukseen";
  if (game.in_checkmate()) how = "mattiin";
  else if (game.in_stalemate()) how = "pattiin";
  else if (game.in_threefold_repetition()) how = "kolmesti toistuneeseen asemaan";
  else if (game.insufficient_material()) how = "riittämättömään materiaaliin";
  else if (game.in_draw()) how = "50 siirron sääntöön";
  if (r === "1/2-1/2") return { cls: "draw", text: "Tasapeli – peli päättyi " + how + "." };
  const won = (r === "1-0") === (play.human === "w");
  return { cls: won ? "win" : "lose", text: (won ? "Voitit! " : "Hävisit. ") + "Peli päättyi " + how + "." };
}

let resignArmed = null;
function renderPlay() {
  // käynnissä oleva peli paneelin ylimpänä, aloitusasetukset työkaluissa
  $("playSec").hidden = !play.active;
  $("foldPlay").hidden = play.active;
  for (const b of $("playColor").children) b.setAttribute("aria-pressed", String(b.dataset.v === play.pick));
  $("playLevel").value = play.level;
  $("playLevelOut").textContent = play.level;
  $("playLevelName").textContent = LEVELS[play.level - 1].name;
  if (!play.active) return;

  const vs = $("playVs");
  vs.replaceChildren(
    el("span", "pdot " + play.human), el("span", null, "Sinä"), el("span", "sep", "vs"),
    el("span", "pdot " + (play.human === "w" ? "b" : "w")), el("span", null, levelLabel(play.level))
  );
  const st = $("playState");
  st.className = "pstate";
  st.replaceChildren();
  const actions = $("playActions");
  actions.replaceChildren();
  const btn = (text, cls, fn) => { const b = el("button", "btn" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); actions.appendChild(b); return b; };

  const note = $("playNote");
  const info = resultInfo();
  if (info) {
    st.classList.add(info.cls);
    st.textContent = info.text;
    note.textContent = "Analyysi ja siirtojen arviot ovat nyt näkyvissä." + (play.hints ? " Vihjeitä käytit " + play.hints + "." : "");
    note.hidden = false;
    btn("Uusi peli", "primary", startPlay);
    btn("Lopeta pelitila", "", () => { stopPlayMode(); save(); renderAll(); analyze(true); });
    return;
  }
  note.hidden = true;

  if (viewPly !== null || variation) st.textContent = "Katselet aiempaa asemaa. Palaa viimeisimpään siirtoon jatkaaksesi.";
  else if (play.thinking) { st.append(el("span", "spin"), "Kone miettii…"); }
  else st.textContent = "Sinun vuorosi.";

  btn("Vihje", "", () => {
    if (play.thinking || view.turn() !== play.human || viewPly !== null) { playMsg("Vihjeen saa omalla vuorollasi viimeisimmässä asemassa."); return; }
    play.hintFen = view.fen(); play.hints++;
    save(); drawArrows(); renderPlay();
    playMsg(curFen === view.fen() && lines[0] ? "Vihje näkyy laudalla nuolena." : "Vihje ilmestyy laudalle, kun moottori on laskenut hetken.");
  });
  const rb = btn(resignArmed ? "Vahvista luovutus" : "Luovuta", resignArmed ? "warn" : "", () => {
    if (!resignArmed) {
      resignArmed = setTimeout(() => { resignArmed = null; renderPlay(); }, 3000);
      renderPlay();
      return;
    }
    clearTimeout(resignArmed); resignArmed = null;
    cancelOppMove();
    game.header("Result", play.human === "w" ? "0-1" : "1-0");
    save(); renderAll(); analyze(true);
  });
  rb.title = "Luovuta peli";
  btn("Lopeta pelitila", "", () => { stopPlayMode(); save(); renderAll(); analyze(true); });
}

$("playColor").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  play.pick = b.dataset.v; save(); renderPlay();
});
$("playLevel").addEventListener("input", (e) => { play.level = +e.target.value; renderPlay(); });
$("playLevel").addEventListener("change", () => save());
let playArmed = null;
$("playStart").addEventListener("click", () => {
  const btn = $("playStart");
  if (!playArmed && game.history().length) {
    btn.textContent = "Vahvista: nykyinen peli korvataan";
    btn.classList.add("warn");
    playArmed = setTimeout(() => { playArmed = null; btn.textContent = "Aloita peli"; btn.classList.remove("warn"); }, 3000);
    return;
  }
  clearTimeout(playArmed); playArmed = null;
  btn.textContent = "Aloita peli"; btn.classList.remove("warn");
  startPlay();
});
