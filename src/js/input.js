// ---------- Siirtojen syöttö ----------
boardEl.addEventListener("click", (e) => {
  const el = e.target.closest(".sq");
  if (!el || pendingPromo) return;
  onSquare(el.dataset.sq);
});

function onSquare(sq) {
  // opetuksen karsitut asemat (esim. kuningas ja ratsu) ovat shakkisääntöjen mukaan "riittämätön materiaali"
  if (view.game_over() && !tutorial.active) return;
  // Opetuksessa siirretään vain tehtävän alkuasemassa, kunnes vaihe on ratkaistu
  if (tutorial.active && (tutorial.solved || game.history().length)) return;
  // Harjoituksessa siirron voi tehdä vain tehtävän asemassa
  if (practice.active && !practice.resolved && (practice.checking || !practice.puzzle || view.fen() !== practice.puzzle.fen)) return;
  // Pelissä konetta vastaan siirron voi tehdä vain omalla vuorolla viimeisimmässä asemassa
  if (assistOff()) {
    if (viewPly !== null || variation) { playMsg("Palaa viimeisimpään siirtoon jatkaaksesi peliä."); return; }
    if (play.thinking || view.turn() !== play.human) { playMsg("Odota, kone miettii siirtoaan."); return; }
  }
  if (selected) {
    const cand = legalFromSel.filter((m) => m.to === sq);
    if (cand.length) {
      if (cand.some((m) => m.promotion)) return askPromotion(selected, sq);
      return playMove({ from: selected, to: sq });
    }
    if (sq === selected) return clearSel();
  }
  const p = view.get(sq);
  if (p && p.color === view.turn()) {
    selected = sq;
    legalFromSel = view.moves({ square: sq, verbose: true });
  } else {
    selected = null; legalFromSel = [];
  }
  renderBoard();
}
function clearSel() { selected = null; legalFromSel = []; renderBoard(); }

function askPromotion(from, to) {
  pendingPromo = { from, to };
  const color = view.turn();
  const box = $("promoBox");
  box.replaceChildren();
  [["q", "Daami"], ["r", "Torni"], ["b", "Lähetti"], ["n", "Ratsu"]].forEach(([t, name]) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("aria-label", name);
    const s = document.createElement("span"); s.className = "piece " + color; s.textContent = GLYPH[t] + "︎";
    b.appendChild(s);
    b.addEventListener("click", () => { const m = pendingPromo; pendingPromo = null; $("promo").hidden = true; playMove({ ...m, promotion: t }); });
    box.appendChild(b);
  });
  $("promo").hidden = false;
}
$("promo").addEventListener("click", (e) => {
  if (e.target.id === "promo") { pendingPromo = null; $("promo").hidden = true; clearSel(); }
});

// Siirto laudalla näkyvästä asemasta. Lopussa siirto jatkaa linjaa. Aiemmassa asemassa sama siirto
// kuin pelissä vain etenee, ja eri siirto aloittaa sivuvariantin, joten pelin loppuosa säilyy.
function playMove(m) {
  selected = null; legalFromSel = [];
  if (tutorial.active) { if (!tutorial.solved) tutorialMove(m); return; }
  if (practice.active && !practice.resolved) { practiceMove(m); return; }
  const res = new Chess(view.fen()).move(m);
  if (!res) { renderBoard(); return; }
  const ms = activeMoves(), ply = curPly();
  const next = ms[ply];
  if (next && next.from === res.from && next.to === res.to && (next.promotion || "") === (res.promotion || "")) {
    viewPly = ply + 1;
  } else if (!variation && ply === ms.length) {
    game.move(m); viewPly = null; playMsg("");
    afterMainMove();
    return;
  } else if (variation && ply >= variation.base) {
    variation.moves = variation.moves.slice(0, ply - variation.base).concat([res]); viewPly = null;
  } else {
    variation = { base: ply, moves: [res] }; viewPly = null;
  }
  rebuildView(); renderAll(); analyze();
}

// Peruu aktiivisen linjan viimeisen siirron (sivuvariantissa variantin siirron)
$("undoBtn").addEventListener("click", () => {
  if (play.active && !variation) { takeback(); return; }
  if (variation) {
    variation.moves.pop();
    if (!variation.moves.length) { viewPly = variation.base; variation = null; } else viewPly = null;
  } else {
    game.undo(); viewPly = null; save();
  }
  selected = null; legalFromSel = [];
  rebuildView(); renderAll(); analyze();
});
$("flipBtn").addEventListener("click", () => { state.flipped = !state.flipped; save(); renderBoard(); drawArrows(); });

let newArmed = null;
$("newBtn").addEventListener("click", () => {
  const btn = $("newBtn");
  if (!newArmed && game.history().length) {
    btn.textContent = "Vahvista: tyhjennä peli";
    btn.classList.add("warn");
    newArmed = setTimeout(() => { newArmed = null; btn.textContent = "Uusi peli"; btn.classList.remove("warn"); }, 3000);
    return;
  }
  clearTimeout(newArmed); newArmed = null;
  btn.textContent = "Uusi peli"; btn.classList.remove("warn");
  stopPlayMode();
  state.gameId = newGameId();
  game.reset(); variation = null; viewPly = null; selected = null; legalFromSel = [];
  save(); rebuildView(); renderAll(); analyze();
});
