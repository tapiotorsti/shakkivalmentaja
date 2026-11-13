// ---------- Harjoittele virheitäsi ----------
// Kertausvälit laatikoittain: 0 = uusi tai epäonnistunut (10 min), sitten 1, 3, 7 ja 21 päivää
const BOX_MS = [10 * 60000, 86400000, 3 * 86400000, 7 * 86400000, 21 * 86400000];
const practice = {
  active: false, queue: [], idx: 0, puzzle: null, snapshot: null,
  attempts: 0, hinted: false, hintSq: null, resolved: false, revealed: false, checking: false, finished: false,
  correct: 0, done: 0, note: "", noteCls: ""
};
let evalJob = null;

async function startPractice() {
  if (tutorial.active) exitTutorial();
  const now = Date.now();
  const due = (await LIB.getAll("puzzles")).filter((p) => p.due <= now).sort((a, b) => a.box - b.box || a.due - b.due);
  if (!due.length) { refreshLibraryUI(); return; }
  if (play.active && !playOver()) { setTab("now"); playMsg("Peli konetta vastaan on kesken. Lopeta tai luovuta se ensin.", true); return; }
  stopPlayMode();
  await librarySave().catch(() => {});
  practice.snapshot = { pgn: game.pgn(), myColor: state.myColor, flipped: state.flipped, gameId: state.gameId };
  Object.assign(practice, { active: true, queue: due.slice(0, 10), idx: 0, correct: 0, done: 0, finished: false });
  setTab("now");
  loadPuzzle();
}

function loadPuzzle() {
  const p = practice.queue[practice.idx];
  Object.assign(practice, { puzzle: p, attempts: 0, hinted: false, hintSq: null, resolved: false, revealed: false, checking: false, note: "", noteCls: "" });
  game.load(p.fen);
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  state.myColor = p.color; state.flipped = p.color === "b";
  syncSettingsUI(); rebuildView(); renderAll(); analyze();
}

function exitPractice() {
  const snap = practice.snapshot;
  Object.assign(practice, { active: false, puzzle: null, snapshot: null, finished: false });
  if (evalJob && opp) { opp.postMessage("stop"); }
  if (snap) {
    if (snap.pgn && snap.pgn.trim()) game.load_pgn(snap.pgn, PGN_OPTS); else game.reset();
    state.myColor = snap.myColor; state.flipped = snap.flipped; state.gameId = snap.gameId;
  }
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  libSig = "";
  syncSettingsUI(); save(); rebuildView(); renderAll(); analyze(true);
  refreshLibraryUI();
}

// Arvioi aseman pelaajan siirron jälkeen vastustajan moottorilla (täysi vahvuus, syvyys 12)
function evalAfterMove(fen, uci) {
  return new Promise((resolve) => {
    const c = new Chess(fen);
    if (!c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })) { resolve(null); return; }
    const after = c.fen();
    if (c.game_over()) { resolve({ score: c.in_checkmate() ? (c.turn() === "w" ? -10000 : 10000) : 0, reply: null, after }); return; }
    const w = oppEngine();
    if (!w) { resolve(null); return; }
    evalJob = { resolve, after, turn: c.turn(), score: 0 };
    w.postMessage("setoption name Skill Level value 20");
    w.postMessage("position fen " + after);
    w.postMessage("go depth 12");
    setTimeout(() => { if (evalJob && evalJob.resolve === resolve) w.postMessage("stop"); }, 10000);
  });
}
function onEvalLine(line) {
  const sm = / score (cp|mate) (-?\d+)/.exec(line);
  if (line.startsWith("info") && sm && line.indexOf(" pv ") > 0 && !/(lower|upper)bound/.test(line)) {
    let v = sm[1] === "mate" ? (+sm[2] > 0 ? 10000 : -10000) : +sm[2];
    if (evalJob.turn === "b") v = -v;
    evalJob.score = v;
  }
  if (line.startsWith("bestmove")) {
    const job = evalJob;
    evalJob = null;
    job.resolve({ score: job.score, reply: line.split(/\s+/)[1], after: job.after });
  }
}

async function practiceMove(m) {
  const p = practice.puzzle;
  if (!p || practice.checking || view.fen() !== p.fen) return;
  const res = game.move(m);
  if (!res) { renderBoard(); return; }
  viewPly = null; rebuildView(); renderAll();
  const uci = res.from + res.to + (res.promotion || "");
  if (uci === p.best) { practiceSolved("best"); return; }
  practice.checking = true; practice.note = ""; renderPractice();
  const r = await evalAfterMove(p.fen, uci);
  practice.checking = false;
  if (!practice.active || practice.puzzle !== p) return;
  const sign = p.color === "w" ? 1 : -1;
  const loss = r ? (winChance(p.beforeScore) - winChance(r.score)) * sign : 1;
  if (r && loss < 0.07) { practiceSolved("alt"); return; }
  practice.attempts++;
  let why = "";
  if (r && r.reply && r.reply !== "(none)") {
    const d = describeMove(r.after, r.reply);
    why = " Vastustaja vastaisi " + d.san + ": " + d.text.charAt(0).toLowerCase() + d.text.slice(1) + ".";
  }
  practice.note = "Ei aivan." + why + " Yritä uudelleen.";
  practice.noteCls = "miss";
  renderPractice();
  setTimeout(() => {
    if (practice.active && practice.puzzle === p && !practice.resolved && game.fen() !== p.fen) { game.undo(); rebuildView(); renderAll(); }
  }, 900);
}

function recordResult(clean) {
  const p = practice.puzzle;
  p.box = clean ? Math.min(BOX_MS.length - 1, (p.box || 0) + 1) : 0;
  p.due = Date.now() + BOX_MS[p.box];
  p.attempts = (p.attempts || 0) + practice.attempts + 1;
  if (clean) { p.solved = (p.solved || 0) + 1; practice.correct++; }
  practice.done++;
  LIB.put("puzzles", p).catch(() => {});
}

function practiceSolved(how) {
  const p = practice.puzzle;
  practice.resolved = true;
  recordResult(practice.attempts === 0 && !practice.hinted);
  const best = describeMove(p.fen, p.best);
  const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  practice.note = how === "best"
    ? "Oikein! " + best.san + ": " + low(best.text) + "."
    : "Hyvä siirto, tämäkin toimii. Moottorin paras oli " + best.san + ": " + low(best.text) + ".";
  practice.noteCls = "win";
  renderAll(); analyze();
}

function practiceReveal() {
  const p = practice.puzzle;
  if (game.fen() !== p.fen) { game.load(p.fen); }
  practice.revealed = true; practice.resolved = true;
  recordResult(false);
  const best = describeMove(p.fen, p.best);
  practice.note = "Ratkaisu: " + best.san + " – " + best.text.charAt(0).toLowerCase() + best.text.slice(1) + ". Tehtävä tulee pian uudelleen.";
  practice.noteCls = "";
  viewPly = null; rebuildView(); renderAll(); analyze();
}

function practiceNext() {
  practice.idx++;
  if (practice.idx >= practice.queue.length) {
    practice.finished = true; practice.puzzle = null;
    renderPractice(); refreshLibraryUI();
    return;
  }
  loadPuzzle();
}

function renderPractice() {
  const sec = $("practiceSec");
  sec.hidden = !practice.active;
  if (!practice.active) return;
  const head = $("prHead"), st = $("prState"), note = $("prNote"), actions = $("prActions");
  actions.replaceChildren();
  const btn = (text, cls, fn) => { const b = el("button", "btn" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); actions.appendChild(b); return b; };
  if (practice.finished) {
    head.textContent = "Harjoitus valmis";
    st.className = "pstate";
    st.textContent = "Ratkaisit " + practice.correct + "/" + practice.done + " tehtävää ensimmäisellä yrityksellä ilman vihjettä.";
    note.textContent = practice.done > practice.correct ? "Väärin menneet tulevat pian uudelleen, oikein ratkaistut myöhemmin kertaukseen." : "Hienoa! Tehtävät palaavat kertaukseen myöhemmin.";
    note.className = "prnote";
    btn("Lopeta harjoitus", "primary", exitPractice);
    return;
  }
  const p = practice.puzzle;
  head.replaceChildren(el("span", null, "Tehtävä " + (practice.idx + 1) + "/" + practice.queue.length), el("span", "sep", "·"),
    el("span", null, "vs " + p.opp + (p.date ? ", " + fmtDate(p.date) : "")));
  st.className = "pstate";
  if (practice.checking) st.replaceChildren(el("span", "spin"), "Tarkistetaan siirtoa…");
  else if (practice.resolved) st.textContent = p.label + ": pelasit " + p.played + (p.kind === "blunder" ? "??" : "?");
  else st.textContent = colorName(p.color) + " siirtää. Pelasit tässä " + p.played + (p.kind === "blunder" ? "??" : "?") + ". Löydä parempi siirto.";
  note.textContent = practice.note;
  note.className = "prnote" + (practice.noteCls ? " " + practice.noteCls : "");
  if (practice.resolved) {
    btn(practice.idx + 1 < practice.queue.length ? "Seuraava tehtävä" : "Näytä tulos", "primary", practiceNext);
    btn("Lopeta", "quiet", exitPractice);
  } else {
    if (!practice.hinted) btn("Vihje", "", () => { practice.hinted = true; practice.hintSq = p.best.slice(0, 2); practice.note = "Siirrä korostettua nappulaa."; practice.noteCls = ""; renderAll(); });
    else btn("Näytä ratkaisu", "", practiceReveal);
    btn("Ohita", "quiet", practiceNext);
    btn("Lopeta", "quiet", exitPractice);
  }
}
