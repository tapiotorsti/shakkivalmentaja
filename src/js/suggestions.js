// ---------- Suositukset ----------
function evalText(l) {
  if (l.type === "mate" && l.v === 0) return "matti";
  if (l.type === "mate") return (l.v > 0 ? "#" : "#-") + Math.abs(l.v);
  const s = l.v / 100;
  return (s > 0 ? "+" : "") + s.toFixed(2);
}

function pvToSan(fen, pv, max) {
  const c = new Chess(fen);
  let no = +fen.split(" ")[5];
  const out = [];
  for (let i = 0; i < Math.min(pv.length, max); i++) {
    const u = pv[i];
    const white = c.turn() === "w";
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) break;
    out.push({ prefix: white ? no + ". " : (i === 0 ? no + "… " : ""), san: fiSan(m.san) });
    if (!white) no++;
  }
  return out;
}

function renderLines() {
  linesEl.replaceChildren();
  $("evalbar").classList.toggle("off", assistOff());
  $("verdict").hidden = true;
  const rows = shownLines();
  linesEl.style.setProperty("--rows", rows);
  // viesti täyttää koko varatun alueen, jotta korkeus ei muutu viestin ja rivien välillä
  const msgRow = (text) => {
    const d = document.createElement("div"); d.className = "line empty"; d.textContent = text;
    d.style.gridRow = "span " + rows;
    linesEl.appendChild(d);
  };
  if (assistOff()) {
    msgRow(tutorial.active
      ? "Opetus käynnissä. Seuraa ohjeita yllä."
      : practice.active
      ? "Tehtävä käynnissä. Moottorin apu näkyy, kun tehtävä on ratkaistu."
      : "Peli konetta vastaan on käynnissä. Moottorin apu on piilossa, kunnes peli päättyy. Vihjeen saa pelipaneelista.");
    setEvalBar(null);
    return;
  }
  if (view.game_over()) {
    let t = "Peli päättyi.";
    if (view.in_checkmate()) t = "Matti! " + (view.turn() === "w" ? "Musta" : "Valkea") + " voitti.";
    else if (view.in_stalemate()) t = "Patti – tasapeli.";
    else if (view.in_threefold_repetition()) t = "Kolmesti toistunut asema – tasapeli.";
    else if (view.insufficient_material()) t = "Riittämätön materiaali – tasapeli.";
    else if (view.in_draw()) t = "Tasapeli (50 siirron sääntö).";
    msgRow(t); setEvalBar(null); return;
  }
  if (!engineReady) { msgRow("Moottori latautuu…"); return; }
  if (isBlocked()) { msgRow("Vastustajan vuoro. Syötä vastustajan siirto laudalle."); setEvalBar(null); return; }
  for (let k = 0; k < rows; k++) {
    const l = curFen ? lines[k] : null;
    if (!l) {
      // paikkamerkki, kunnes moottorilta tulee tämä vaihtoehto
      const ph = document.createElement("div"); ph.className = "line ph";
      const chip = document.createElement("span"); chip.className = "chip"; chip.style.background = "var(" + ARROW_COLORS[k] + ")"; chip.style.opacity = ".35";
      const ev = document.createElement("span"); ev.className = "ev"; ev.style.visibility = "hidden"; ev.textContent = "0.00";
      const pv = document.createElement("span"); pv.className = "pv"; pv.textContent = k === 0 ? "Lasketaan…" : "";
      ph.append(chip, ev, pv);
      linesEl.appendChild(ph);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button"; b.className = "line";
    const chip = document.createElement("span"); chip.className = "chip"; chip.style.background = "var(" + ARROW_COLORS[k] + ")";
    const ev = document.createElement("span"); ev.className = "ev" + (l.v >= 0 ? " pos" : ""); ev.textContent = evalText(l);
    const pv = document.createElement("span"); pv.className = "pv";
    if (state.beginner) {
      const d = describeMove(curFen, l.pv[0]);
      pv.append("Paras siirto ", Object.assign(document.createElement("b"), { textContent: d.san }), ": " + d.text + ".");
    } else pvToSan(curFen, l.pv, 9).forEach((m, i) => {
      if (m.prefix) pv.appendChild(document.createTextNode(m.prefix));
      if (i === 0) { const s = document.createElement("b"); s.textContent = m.san; pv.appendChild(s); }
      else pv.appendChild(document.createTextNode(m.san));
      pv.appendChild(document.createTextNode(" "));
    });
    b.append(chip, ev, pv);
    b.title = "Pelaa ensimmäinen siirto";
    b.addEventListener("click", () => {
      const u = l.pv[0];
      playMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    });
    linesEl.appendChild(b);
  }
  setEvalBar(curFen ? lines[0] : null);
}

const shownLines = () => (state.beginner ? 1 : state.multipv);

function setVerdict(l) {
  const el = $("verdict");
  if (!l) { el.hidden = true; return; }
  let text;
  if (l.type === "mate") {
    text = (l.v > 0 ? "Valkea" : "Musta") + " tekee matin " + Math.abs(l.v) + " siirrossa";
  } else {
    const a = Math.abs(l.v), side = l.v > 0 ? "Valkealla" : "Mustalla";
    if (a < 30) text = "Tasainen asema";
    else if (a < 70) text = side + " pieni etu";
    else if (a < 150) text = side + " selvä etu";
    else if (a < 300) text = side + " suuri etu";
    else text = side + " voittava asema";
  }
  const mine = l.type === "mate" ? l.v : (Math.abs(l.v) < 30 ? 0 : l.v);
  let note = "";
  if (mine !== 0) note = (mine > 0) === (state.myColor === "w") ? "sinun eduksesi" : "vastustajan eduksi";
  el.replaceChildren(document.createTextNode(state.beginner ? text : text + " (" + evalText(l) + ")"));
  if (note) { const s = document.createElement("small"); s.textContent = note; el.appendChild(s); }
  el.hidden = false;
}

function setEvalBar(l) {
  $("evalbar").classList.toggle("off", assistOff());
  // uuden aseman laskennan ajaksi palkki jää edelliseen arvoon eikä käy välillä puolivälissä
  if (!l && !view.game_over() && !assistOff() && !isBlocked()) return;
  setVerdict(l && !view.game_over() ? l : null);
  let pct = 50;
  if (view.in_checkmate()) pct = view.turn() === "w" ? 0 : 100;
  else if (l) pct = l.type === "mate" ? (l.v > 0 ? 100 : 0) : 100 / (1 + Math.exp(-l.v / 250));
  $("evalfill").style.height = pct.toFixed(1) + "%";
}

// ---------- Nuolet ----------
function arrowPoly(uci, w, hw, hl) {
  const a = squareXY(uci.slice(0, 2)), b = squareXY(uci.slice(2, 4));
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const ex = b.x - ux * 0.12, ey = b.y - uy * 0.12; // kärki hieman ennen ruudun keskustaa
  const bx = ex - ux * hl, by = ey - uy * hl;
  const sx = a.x + ux * 0.18, sy = a.y + uy * 0.18;
  const pts = [
    [sx + nx * w / 2, sy + ny * w / 2], [bx + nx * w / 2, by + ny * w / 2], [bx + nx * hw / 2, by + ny * hw / 2],
    [ex, ey], [bx - nx * hw / 2, by - ny * hw / 2], [bx - nx * w / 2, by - ny * w / 2], [sx - nx * w / 2, sy - ny * w / 2]
  ];
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("points", pts.map((p) => p[0].toFixed(3) + "," + p[1].toFixed(3)).join(" "));
  poly.setAttribute("stroke-linejoin", "round");
  return poly;
}

function drawArrows() {
  arrowsEl.replaceChildren();
  if (assistOff()) {
    // pelin aikana vain pyydetty vihje
    const l = lines[0];
    if (play.hintFen && play.hintFen === view.fen() && curFen === view.fen() && l && l.pv[0]) {
      const poly = arrowPoly(l.pv[0], 0.2, 0.5, 0.42);
      poly.setAttribute("fill", cssVar("--a1"));
      poly.setAttribute("fill-opacity", "0.9");
      poly.setAttribute("stroke", "rgba(0,0,0,.35)");
      poly.setAttribute("stroke-width", "0.02");
      arrowsEl.appendChild(poly);
    }
    return;
  }
  const solution = practice.active && practice.resolved && practice.puzzle && view.fen() === practice.puzzle.fen ? practice.puzzle.best : null;
  const better = solution || reviewArrow();
  if (better) {
    const poly = arrowPoly(better, 0.16, 0.44, 0.38);
    poly.setAttribute("fill", cssVar("--q-best"));
    poly.setAttribute("fill-opacity", "0.28");
    poly.setAttribute("stroke", cssVar("--q-best"));
    poly.setAttribute("stroke-width", "0.05");
    poly.setAttribute("stroke-dasharray", "0.12 0.08");
    arrowsEl.appendChild(poly);
  }
  if (!curFen || curFen !== view.fen() || isBlocked()) return;
  for (let k = Math.min(shownLines(), lines.length) - 1; k >= 0; k--) {
    const l = lines[k];
    if (!l || !l.pv[0]) continue;
    const poly = k === 0 ? arrowPoly(l.pv[0], 0.2, 0.5, 0.42) : arrowPoly(l.pv[0], 0.14, 0.4, 0.36);
    poly.setAttribute("fill", cssVar(ARROW_COLORS[k]));
    poly.setAttribute("fill-opacity", k === 0 ? "0.9" : "0.72");
    poly.setAttribute("stroke", "rgba(0,0,0,.35)");
    poly.setAttribute("stroke-width", "0.02");
    arrowsEl.appendChild(poly);
  }
}
