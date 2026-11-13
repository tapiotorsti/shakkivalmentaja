// ---------- Moottori ----------
let engine = null, engineReady = false, searching = false, needRestart = false;
let wantFen = null, curFen = null;
let mode = null, searchFen = null, mainDone = false; // mode: "main" = nykyinen asema, "bg" = aiempien siirtojen arviointi
let lines = [], lastDepth = 0, rafPending = false;

function setStatus(text, st) {
  if (state.beginner && st === "run") text = "Moottori miettii…";
  else if (state.beginner && st === "done") text = "Valmis";
  $("statusText").textContent = text;
  $("status").title = text; // koko teksti näkyy, vaikka kiinteän levyinen rivi lyhentäisi sen
  $("status").dataset.state = st;
}

function initEngine() {
  try {
    engine = makeWorker();
  } catch (e) {
    setStatus("Moottoria ei voitu käynnistää", "err");
    return;
  }
  engine.onmessage = (e) => onEngineLine(typeof e.data === "string" ? e.data : String(e.data));
  engine.onerror = () => setStatus("Moottorin lataus epäonnistui – tarkista verkkoyhteys", "err");
  send("uci");
  setTimeout(() => { if (!engineReady) setStatus("Moottori latautuu hitaasti…", "run"); }, 8000);
}
function send(cmd) { if (engine) engine.postMessage(cmd); }

function onEngineLine(line) {
  if (line === "uciok") { send("isready"); return; }
  if (line === "readyok") {
    if (!engineReady) { engineReady = true; analyze(); }
    return;
  }
  if (line.startsWith("bestmove")) {
    searching = false;
    const was = mode;
    mode = null;
    if (needRestart) { needRestart = false; startSearch(); return; }
    if (was === "main") mainDone = true;
    scheduleBg();
    return;
  }
  if (needRestart || !line.startsWith("info") || line.indexOf(" pv ") < 0) return;
  if (/ (lowerbound|upperbound)/.test(line)) return;
  const depth = +(/ depth (\d+)/.exec(line) || [])[1];
  const k = +((/ multipv (\d+)/.exec(line) || [null, 1])[1]) - 1;
  const sm = / score (cp|mate) (-?\d+)/.exec(line);
  const pv = line.split(" pv ")[1].trim().split(/\s+/);
  if (!sm || !depth) return;
  let v = +sm[2];
  if (searchFen.split(" ")[1] === "b") v = -v; // valkean näkökulmaan
  const l = { depth, type: sm[1], v, pv };
  if (k === 0) storeEval(searchFen, l);
  if (mode === "main") {
    lines[k] = l;
    if (k === 0) lastDepth = depth;
    setStatus("Laskee · syvyys " + lastDepth + "/" + state.depth, "run");
  }
  scheduleRender();
}

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderLines(); renderMovesIfChanged(); renderReview(); drawArrows(); scheduleLibrarySave(); });
}

function analyze(force) {
  if (!engineReady) return;
  wantFen = view.game_over() ? null : view.fen();
  if (!force && wantFen && wantFen === curFen && (mode === "main" || mainDone)) return;
  lines = [];
  if (searching) { needRestart = true; send("stop"); renderLines(); drawArrows(); }
  else startSearch();
}

function go(m, fen, multipv, depth) {
  searching = true; mode = m; searchFen = fen;
  send("setoption name MultiPV value " + multipv);
  send("position fen " + fen);
  send("go depth " + depth);
}

function startSearch() {
  lines = []; lastDepth = 0; mainDone = false;
  curFen = wantFen;
  if (!curFen) { renderLines(); drawArrows(); scheduleBg(); return; }
  go("main", curFen, assistOff() ? 1 : state.multipv, state.depth); // pelin aikana vain vihjettä varten
  setStatus("Laskee…", "run");
  renderLines(); drawArrows();
}

const bgTried = new Set();
// Kun nykyinen asema on laskettu, arvioidaan pelin aiemmat asemat siirtojen arviointia varten
function scheduleBg() {
  const depth = Math.min(BG_DEPTH, state.depth);
  const all = variation ? positions().concat(positionsOf(mainMoves())) : positions();
  const todo = all.filter((p) => {
    const e = evalOf(p.fen);
    return (!e || e.depth < depth) && !bgTried.has(p.fen + "@" + depth);
  });
  if (todo.length) {
    bgTried.add(todo[0].fen + "@" + depth);
    go("bg", todo[0].fen, 1, depth);
    setStatus("Arvioi siirtoja · " + todo.length + " jäljellä", "run");
  } else {
    setStatus(curFen ? "Valmis · syvyys " + lastDepth : "Peli päättyi", "done");
  }
  scheduleRender();
}
