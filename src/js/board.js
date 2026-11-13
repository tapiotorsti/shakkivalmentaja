// ---------- Lauta ----------
function renderBoard() {
  const hist = view.history({ verbose: true });
  const last = hist[hist.length - 1];
  const checkSq = view.in_check() ? kingSquare(view.turn()) : null;
  const targets = new Map(legalFromSel.map((m) => [m.to, m]));
  const ranks = state.flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = state.flipped ? FILES.split("").reverse() : FILES.split("");
  const dangers = state.beginner ? dangersFor(view.fen(), state.myColor) : new Map();
  const goals = tutorialGoalSquares();
  // näppäimistön kohdistus pysyy samassa ruudussa, vaikka lauta piirretään uudelleen
  const focused = boardEl.contains(document.activeElement) ? document.activeElement.dataset.sq : null;

  const frag = document.createDocumentFragment();
  ranks.forEach((rank, ri) => {
    files.forEach((file, fi) => {
      const sq = file + rank;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "sq";
      el.dataset.sq = sq;
      if ((FILES.indexOf(file) + rank) % 2 === 1) el.classList.add("dark");
      if (last && (last.from === sq || last.to === sq)) el.classList.add("last");
      if (selected === sq) el.classList.add("sel");
      if (goals.includes(sq)) el.classList.add("goalsq");
      if (practice.active && practice.hintSq === sq && view.fen() === (practice.puzzle && practice.puzzle.fen)) el.classList.add("hintsq");
      if (checkSq === sq) el.classList.add("check");
      const p = view.get(sq);
      const warn = dangers.get(sq);
      if (targets.has(sq)) {
        el.classList.add("target");
        if (p || targets.get(sq).flags.includes("e")) el.classList.add("capture");
      }
      // ruudunlukijalle sama tieto kuin laudan korostuksissa: nappula, valinta, mahdolliset siirrot ja shakki
      const label = [p ? sq + " " + (p.color === "w" ? "valkea " : "musta ") + NAME[p.type] : sq];
      if (p) {
        const s = document.createElement("span");
        s.className = "piece " + p.color;
        s.textContent = GLYPH[p.type] + "︎";
        el.appendChild(s);
        if (warn) {
          const w = document.createElement("span"); w.className = "warn"; w.textContent = "!"; w.setAttribute("aria-hidden", "true");
          el.appendChild(w);
          label.push("uhattuna");
        }
      }
      if (selected === sq) label.push("valittu");
      if (targets.has(sq)) label.push(el.classList.contains("capture") ? "lyönti mahdollinen" : "siirto mahdollinen");
      if (checkSq === sq) label.push("shakissa");
      if (last && (last.from === sq || last.to === sq)) label.push("viimeisin siirto");
      if (goals.includes(sq)) label.push("tavoiteruutu");
      if (el.classList.contains("hintsq")) label.push("vihje: siirrä tätä nappulaa");
      el.setAttribute("aria-label", label.join(", "));
      if (fi === 0) {
        const c = document.createElement("span"); c.className = "coord rank"; c.textContent = rank; el.appendChild(c);
      }
      if (ri === 7) {
        const c = document.createElement("span"); c.className = "coord file"; c.textContent = file; el.appendChild(c);
      }
      frag.appendChild(el);
    });
  });
  boardEl.replaceChildren(frag);
  if (focused) { const f = boardEl.querySelector('[data-sq="' + focused + '"]'); if (f) f.focus({ preventScroll: true }); }
  $("evalbar").classList.toggle("flipped", state.flipped);
  animatePieces(snapshotPieces());
  renderMaterial();
  renderCoach(dangers);
}
